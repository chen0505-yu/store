-- 修正 039 的 pos_checkout()：p_shared_group_id 為 null（一般單一 Artist 結帳，
-- 也就是絕大多數呼叫）時，v_shared_group 這個 record 變數完全沒有被賦值過，
-- 但後面 insert into pos_orders 卻無條件引用 v_shared_group.name，導致
-- plpgsql 丟出「record "v_shared_group" is not assigned yet」而讓一般結帳整個失敗。
--
-- 改用一個獨立的 text 變數 v_shared_group_name，只有在共用攤位分支裡才賦值，
-- 一般結帳維持 null，其餘邏輯（贈品額度、庫存扣除、找零）完全不變。
--
-- 請在 Supabase SQL Editor 執行本檔案（承接 001~040，需先執行過 040 移除舊版
-- 6 參數 overload，這裡才會單純是同簽名的 create or replace，不會又產生新的 overload）。

create or replace function pos_checkout(
  p_event_id uuid,
  p_artist_id uuid,
  p_staff_id uuid,
  p_received_amount numeric,
  p_items jsonb,
  p_freebie_option_ids jsonb default '[]'::jsonb,
  p_shared_group_id uuid default null
)
returns text
language plpgsql
as $$
declare
  v_event record;
  v_artist record;
  v_shared_group record;
  v_shared_group_name text;
  v_order_id uuid;
  v_order_number text;
  v_item jsonb;
  v_group_id uuid;
  v_quantity int;
  v_group record;
  v_item_artist_id uuid;
  v_item_artist_name text;
  v_subtotal numeric := 0;
  v_artist_subtotal numeric;
  v_freebie_id_text text;
  v_freebie_option_id uuid;
  v_freebie_option record;
  v_freebie_rule record;
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

  if p_shared_group_id is not null then
    select * into v_shared_group from pos_artist_groups where id = p_shared_group_id;
    if not found or v_shared_group.event_id <> p_event_id then
      raise exception '找不到共用攤位';
    end if;
    if not exists (
      select 1 from pos_artist_group_members
      where group_id = p_shared_group_id and artist_id = p_artist_id
    ) then
      raise exception '代表繪師不屬於這個共用攤位';
    end if;
    v_shared_group_name := v_shared_group.name;
  end if;

  v_order_number := next_order_number();

  insert into pos_orders (
    order_number, event_id, event_name, event_day_label, event_booth_number,
    artist_id, artist_name, staff_id, received_amount, shared_group_id, shared_group_name
  )
  values (
    v_order_number, p_event_id, v_event.name, v_event.day_label, v_event.booth_number,
    p_artist_id, v_artist.name, p_staff_id, p_received_amount,
    p_shared_group_id, v_shared_group_name
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

    if p_shared_group_id is null then
      if v_group.artist_id <> p_artist_id then
        raise exception '商品不屬於此繪師';
      end if;
      v_item_artist_id := p_artist_id;
      v_item_artist_name := v_artist.name;
    else
      if not exists (
        select 1 from pos_artist_group_members
        where group_id = p_shared_group_id and artist_id = v_group.artist_id
      ) then
        raise exception '「%」不屬於這個共用攤位', v_group.name;
      end if;
      select id, name into v_item_artist_id, v_item_artist_name from pos_artists where id = v_group.artist_id;
    end if;

    if v_group.stock_quantity < v_quantity then
      raise exception '「%」庫存不足', v_group.name;
    end if;

    update pos_product_groups set stock_quantity = stock_quantity - v_quantity where id = v_group_id;

    insert into pos_order_items (order_id, group_id, group_name, unit_price, quantity, artist_id, artist_name)
    values (v_order_id, v_group_id, v_group.name, v_group.price, v_quantity, v_item_artist_id, v_item_artist_name);

    v_subtotal := v_subtotal + (v_group.price * v_quantity);
  end loop;

  if p_freebie_option_ids is not null and jsonb_array_length(p_freebie_option_ids) > 0 then
    for v_freebie_id_text in select value #>> '{}' from jsonb_array_elements(p_freebie_option_ids)
    loop
      v_freebie_option_id := v_freebie_id_text::uuid;

      select * into v_freebie_option from pos_freebie_options where id = v_freebie_option_id for update;
      if not found then
        raise exception '找不到贈品選項';
      end if;

      select * into v_freebie_rule from pos_freebie_rules where id = v_freebie_option.rule_id;
      if not found or not v_freebie_rule.is_active then
        raise exception '贈品規則不存在或已停用';
      end if;

      if p_shared_group_id is null then
        if v_freebie_rule.artist_id <> p_artist_id then
          raise exception '贈品規則不屬於此繪師';
        end if;
      else
        if not exists (
          select 1 from pos_artist_group_members
          where group_id = p_shared_group_id and artist_id = v_freebie_rule.artist_id
        ) then
          raise exception '贈品規則不屬於這個共用攤位';
        end if;
      end if;

      select coalesce(sum(unit_price * quantity), 0) into v_artist_subtotal
      from pos_order_items
      where order_id = v_order_id and is_freebie = false and artist_id = v_freebie_rule.artist_id;

      if v_freebie_rule.rule_type = 'spend_threshold' then
        select coalesce(sum(fr.threshold_amount), 0) into v_quota_used
        from pos_order_items oi
        join pos_freebie_options fo2 on fo2.id = oi.freebie_option_id
        join pos_freebie_rules fr on fr.id = fo2.rule_id
        where oi.order_id = v_order_id and fr.rule_type = 'spend_threshold' and fr.artist_id = v_freebie_rule.artist_id;

        v_quota_used := v_quota_used + v_freebie_rule.threshold_amount;
        if v_quota_used > v_artist_subtotal then
          raise exception '「%」贈品額度不足', v_freebie_rule.name;
        end if;
      else
        select count(*) into v_redeem_count
        from pos_order_items oi
        join pos_freebie_options fo on fo.id = oi.freebie_option_id
        where oi.order_id = v_order_id and fo.rule_id = v_freebie_rule.id;
        v_redeem_count := v_redeem_count + 1;

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

        if v_redeem_count > v_earned_count then
          raise exception '「%」不符合贈品資格或已達可領取次數上限', v_freebie_rule.name;
        end if;
      end if;

      if v_freebie_option.stock_quantity < 1 then
        raise exception '「%」贈品庫存不足', v_freebie_option.name;
      end if;

      update pos_freebie_options set stock_quantity = stock_quantity - 1 where id = v_freebie_option_id;

      insert into pos_order_items (order_id, group_id, group_name, unit_price, quantity, is_freebie, freebie_option_id, artist_id, artist_name)
      values (
        v_order_id, null, v_freebie_option.name, 0, 1, true, v_freebie_option_id,
        v_freebie_rule.artist_id, (select name from pos_artists where id = v_freebie_rule.artist_id)
      );
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
