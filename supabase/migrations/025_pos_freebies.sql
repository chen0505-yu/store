-- Phase 2：滿額贈品 / 指定商品贈品。
--
-- 兩種規則類型：
--   spend_threshold（滿額）：小計達到 threshold_amount 就賺到資格。
--   buy_product（指定商品）：這筆訂單買到 trigger_group_id 這個商品主項就賺到資格。
-- 每一條規則自己有獨立的 is_stackable 開關（不是全站統一），賺到的次數：
--   spend_threshold + 可累贈： floor(小計 / 門檻金額)
--   spend_threshold + 不可累贈：小計 >= 門檻金額 ? 1 : 0
--   buy_product   + 可累贈： 該商品在這筆訂單的購買數量
--   buy_product   + 不可累贈：買到 >=1 件 ? 1 : 0
-- 一條規則底下可以有多款候選贈品（多選一），小幫手每賺到一次資格就從候選裡選一款，
-- 也可以選擇不拿（不強制）。贈品單價固定 0 元，會寫進 pos_order_items（is_freebie=true）。
--
-- 請在 Supabase SQL Editor 執行本檔案（承接 001~022）。

do $$ begin
  create type pos_freebie_rule_type as enum ('spend_threshold', 'buy_product');
exception when duplicate_object then null;
end $$;

create table if not exists pos_freebie_rules (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references pos_artists(id) on delete cascade,
  name text not null, -- 給後台辨識用，例如「滿500送贈品」「買印刷品送貼紙」
  rule_type pos_freebie_rule_type not null,
  threshold_amount numeric(10, 2), -- 只用於 spend_threshold
  trigger_group_id uuid references pos_product_groups(id) on delete cascade, -- 只用於 buy_product
  is_stackable boolean not null default false,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists pos_freebie_rules_artist_id_idx on pos_freebie_rules(artist_id);

create table if not exists pos_freebie_options (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references pos_freebie_rules(id) on delete cascade,
  name text not null,
  stock_quantity int not null default 0,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists pos_freebie_options_rule_id_idx on pos_freebie_options(rule_id);

alter table pos_order_items add column if not exists freebie_option_id uuid references pos_freebie_options(id) on delete set null;

alter table pos_freebie_rules enable row level security;
alter table pos_freebie_options enable row level security;

-- pos_checkout：延續 022 版本的商品扣庫存/建訂單邏輯，新增 p_freebie_option_ids
-- （預設空陣列，呼叫端不傳也不會壞），在同一筆交易裡處理贈品資格判斷與庫存扣除，
-- 維持「全部成功或全部失敗」——資格不符或贈品庫存不足都會讓整筆訂單 rollback。
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
        if v_freebie_rule.is_stackable then
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
