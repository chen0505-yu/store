-- 新增第二種滿額贈模式：「額度池模式」。
--
-- 現有的「一般門檻模式」（combinable_rule_ids）是「達到最高門檻拿一組固定的贈品」。
-- 額度池模式不一樣：購物車小計就是一包「贈品額度」，每個滿額規則的門檻金額就是
-- 兌換一次那款贈品要花掉的額度，小幫手可以自由挑選任意組合的贈品，只要
-- 已花掉的門檻金額總和不超過小計即可（例如小計900：可以選「滿400」+「滿500」，
-- 或「滿400」x2，但不能選「滿500」x2，因為 500+500=1000 > 900）。
-- 這跟一般門檻模式「只認最高門檻」的邏輯完全不同，所以用繪師層級的開關
-- （pos_artists.freebie_mode）決定這位繪師的所有 spend_threshold 規則要用哪一種
-- 判斷方式，而不是每條規則自己選（避免同一位繪師底下兩種模式的規則互相打架）。
-- 額度池模式下，spend_threshold 規則的 is_stackable / combinable_rule_ids 兩個欄位
-- 不會被讀取（沿用資料庫既有欄位，不需要另外清空，只是額度池模式不看它們）。
-- buy_product 類型規則不受此開關影響，兩種模式下行為相同。
--
-- 請在 Supabase SQL Editor 執行本檔案（承接 001~026）。

alter table pos_artists
  add column if not exists freebie_mode text not null default 'tiered'
  check (freebie_mode in ('tiered', 'quota_pool'));

create or replace function pos_checkout(
  p_event_id uuid,
  p_artist_id uuid,
  p_staff_id uuid,
  p_received_amount numeric,
  p_items jsonb,
  p_freebie_option_ids jsonb default '[]'::jsonb
)
returns text
language plpgsql
as $$
declare
  v_event record;
  v_artist record;
  v_order_id uuid;
  v_order_number text;
  v_item jsonb;
  v_group_id uuid;
  v_quantity int;
  v_group record;
  v_subtotal numeric := 0;
  v_freebie_id_text text;
  v_freebie_option_id uuid;
  v_freebie_option record;
  v_freebie_rule record;
  v_top_rule record;
  v_redeem_count int;
  v_earned_count int;
  v_purchased_qty int;
  v_quota_used numeric := 0;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception '購物車是空的';
  end if;

  select * into v_event from pos_events where id = p_event_id;
  if not found then
    raise exception '找不到活動';
  end if;

  select * into v_artist from pos_artists where id = p_artist_id;
  if not found or v_artist.event_id <> p_event_id then
    raise exception '找不到繪師';
  end if;

  v_order_number := next_order_number();

  insert into pos_orders (
    order_number, event_id, event_name, event_day_label, event_booth_number,
    artist_id, artist_name, staff_id, received_amount
  )
  values (
    v_order_number, p_event_id, v_event.name, v_event.day_label, v_event.booth_number,
    p_artist_id, v_artist.name, p_staff_id, p_received_amount
  )
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_group_id := (v_item->>'group_id')::uuid;
    v_quantity := (v_item->>'quantity')::int;

    if v_quantity is null or v_quantity <= 0 then
      raise exception '商品數量不正確';
    end if;

    select * into v_group from pos_product_groups where id = v_group_id for update;
    if not found then
      raise exception '找不到商品';
    end if;
    if v_group.artist_id <> p_artist_id then
      raise exception '商品不屬於此繪師';
    end if;
    if v_group.stock_quantity < v_quantity then
      raise exception '「%」庫存不足', v_group.name;
    end if;

    update pos_product_groups set stock_quantity = stock_quantity - v_quantity where id = v_group_id;

    insert into pos_order_items (order_id, group_id, group_name, unit_price, quantity)
    values (v_order_id, v_group_id, v_group.name, v_group.price, v_quantity);

    v_subtotal := v_subtotal + (v_group.price * v_quantity);
  end loop;

  -- 贈品處理：此時付費商品都已經寫入 pos_order_items，v_subtotal 也已經算好，
  -- 才能正確判斷 spend_threshold / buy_product 兩種規則是否賺到資格。
  if p_freebie_option_ids is not null and jsonb_array_length(p_freebie_option_ids) > 0 then
    for v_freebie_id_text in select value #>> '{}' from jsonb_array_elements(p_freebie_option_ids)
    loop
      v_freebie_option_id := v_freebie_id_text::uuid;

      select * into v_freebie_option from pos_freebie_options where id = v_freebie_option_id for update;
      if not found then
        raise exception '找不到贈品選項';
      end if;

      select * into v_freebie_rule from pos_freebie_rules where id = v_freebie_option.rule_id;
      if not found or v_freebie_rule.artist_id <> p_artist_id or not v_freebie_rule.is_active then
        raise exception '贈品規則不屬於此繪師或已停用';
      end if;

      -- 這條規則在這筆訂單目前已經選了幾次（含這一次）
      select count(*) into v_redeem_count
      from pos_order_items oi
      join pos_freebie_options fo on fo.id = oi.freebie_option_id
      where oi.order_id = v_order_id and fo.rule_id = v_freebie_rule.id;
      v_redeem_count := v_redeem_count + 1;

      if v_freebie_rule.rule_type = 'spend_threshold' and v_artist.freebie_mode = 'quota_pool' then
        -- 額度池模式：不看「賺到幾次」，而是看目前累計花掉的額度（含這一次）
        -- 有沒有超過購物車小計。不管 is_stackable / combinable_rule_ids。
        v_quota_used := v_quota_used + v_freebie_rule.threshold_amount;
        if v_quota_used > v_subtotal then
          raise exception '「%」贈品額度不足', v_freebie_rule.name;
        end if;
        v_earned_count := v_redeem_count;
      elsif v_freebie_rule.rule_type = 'spend_threshold' then
        -- 一般門檻模式（現有邏輯不變）
        if v_subtotal < v_freebie_rule.threshold_amount then
          v_earned_count := 0;
        else
          -- 找出這位繪師目前「已達成的最高門檻」滿額規則，只有它自己、
          -- 以及被它 combinable_rule_ids 明確列入的較低門檻規則才有效。
          select * into v_top_rule
          from pos_freebie_rules
          where artist_id = p_artist_id
            and rule_type = 'spend_threshold'
            and is_active
            and threshold_amount <= v_subtotal
          order by threshold_amount desc
          limit 1;

          if v_top_rule.id = v_freebie_rule.id or v_freebie_rule.id = any(v_top_rule.combinable_rule_ids) then
            v_earned_count := case
              when v_freebie_rule.is_stackable then floor(v_subtotal / v_freebie_rule.threshold_amount)
              else 1
            end;
          else
            v_earned_count := 0;
          end if;
        end if;
      else
        select coalesce(sum(quantity), 0) into v_purchased_qty
        from pos_order_items
        where order_id = v_order_id
          and group_id = v_freebie_rule.trigger_group_id
          and is_freebie = false;

        if v_freebie_rule.is_stackable then
          v_earned_count := v_purchased_qty;
        else
          v_earned_count := case when v_purchased_qty >= 1 then 1 else 0 end;
        end if;
      end if;

      if v_redeem_count > v_earned_count then
        raise exception '「%」不符合贈品資格或已達可領取次數上限', v_freebie_rule.name;
      end if;

      if v_freebie_option.stock_quantity < 1 then
        raise exception '「%」贈品庫存不足', v_freebie_option.name;
      end if;

      update pos_freebie_options set stock_quantity = stock_quantity - 1 where id = v_freebie_option_id;

      insert into pos_order_items (order_id, group_id, group_name, unit_price, quantity, is_freebie, freebie_option_id)
      values (v_order_id, null, v_freebie_option.name, 0, 1, true, v_freebie_option_id);
    end loop;
  end if;

  if p_received_amount < v_subtotal then
    raise exception '收款金額不足，應收 %', v_subtotal;
  end if;

  update pos_orders
  set subtotal_amount = v_subtotal,
      total_amount = v_subtotal,
      change_amount = p_received_amount - v_subtotal
  where id = v_order_id;

  return v_order_number;
end;
$$;
