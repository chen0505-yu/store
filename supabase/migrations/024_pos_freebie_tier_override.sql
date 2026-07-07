-- 滿額贈品分層設定：每一條「滿額」規則可以自己決定，符合這個門檻時要不要
-- 蓋掉比它門檻低的規則。例如 220 送A、420 送B、550 送C：
--   老師A：550 這條設「覆蓋較低門檻」→ 消費到 550 時 220/420 都失效，只能領 C。
--   老師B：550 這條設「保留較低門檻」→ 消費到 550 時 220/420/550 都還有效，A/B/C 都能領。
-- 只影響同一位繪師底下的 spend_threshold（滿額）規則彼此之間；不影響 buy_product（指定商品）規則。
--
-- 請在 Supabase SQL Editor 執行本檔案（承接 001~023）。

alter table pos_freebie_rules add column if not exists overrides_lower_tiers boolean not null default false;

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
  v_redeem_count int;
  v_earned_count int;
  v_purchased_qty int;
  v_is_overridden boolean;
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

      if v_freebie_rule.rule_type = 'spend_threshold' then
        -- 是否被「門檻更高、也已達成、且設定覆蓋較低門檻」的規則蓋掉。
        select exists (
          select 1 from pos_freebie_rules r2
          where r2.artist_id = p_artist_id
            and r2.rule_type = 'spend_threshold'
            and r2.is_active
            and r2.overrides_lower_tiers
            and r2.threshold_amount > v_freebie_rule.threshold_amount
            and v_subtotal >= r2.threshold_amount
        ) into v_is_overridden;

        if v_is_overridden then
          v_earned_count := 0;
        elsif v_freebie_rule.is_stackable then
          v_earned_count := floor(v_subtotal / v_freebie_rule.threshold_amount);
        else
          v_earned_count := case when v_subtotal >= v_freebie_rule.threshold_amount then 1 else 0 end;
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
