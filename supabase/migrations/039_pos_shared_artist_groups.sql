-- 簡化版共用攤位：多位 Artist 共用同一個 POS 收銀頁面/同一次結帳。不建立 pos_booths
-- 這類大型攤位系統，只用兩張小表記錄「哪些 Artist 屬於同一個共用群組」，完全不動
-- pos_artists 本身的資料結構與獨立頁面。
--
-- 請在 Supabase SQL Editor 執行本檔案（承接 001~038）。

create table if not exists pos_artist_groups (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references pos_events(id) on delete cascade,
  name text not null, -- 例如「主攤」
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists pos_artist_groups_event_id_idx on pos_artist_groups(event_id);

-- unique(artist_id)：一位 Artist 同時只能屬於一個共用群組，避免 POS 前台不知道
-- 要進哪一頁，也避免結帳驗證邏輯要處理「屬於多個群組」的模糊情況。
create table if not exists pos_artist_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references pos_artist_groups(id) on delete cascade,
  artist_id uuid not null references pos_artists(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (artist_id)
);

create index if not exists pos_artist_group_members_group_id_idx on pos_artist_group_members(group_id);

-- ---------------------------------------------------------------------------
-- pos_order_items 補上 artist_id / artist_name 快照。on delete set null（不是
-- cascade）比照既有 group_id/variant_id 的做法：Artist 之後被刪除也不會牽動
-- 已成立的訂單明細，只是這欄的參照斷開，artist_name 快照仍然完整可讀。
-- ---------------------------------------------------------------------------
alter table pos_order_items add column if not exists artist_id uuid references pos_artists(id) on delete set null;
alter table pos_order_items add column if not exists artist_name text;

create index if not exists pos_order_items_artist_id_idx on pos_order_items(artist_id);

-- 舊資料回填，之後報表/Excel/訂單查詢才不用長期依賴 fallback：
-- 1) 一般付費商品：group_id → pos_product_groups.artist_id → pos_artists.name。
update pos_order_items oi
set artist_id = pg.artist_id,
    artist_name = pa.name
from pos_product_groups pg
join pos_artists pa on pa.id = pg.artist_id
where oi.group_id = pg.id
  and oi.artist_id is null;

-- 2) 贈品明細：group_id 本來就是 null，改用 freebie_option_id → pos_freebie_options.rule_id
--    → pos_freebie_rules.artist_id 回推所屬 Artist（贈品規則本來就歸屬單一 Artist）。
update pos_order_items oi
set artist_id = fr.artist_id,
    artist_name = pa.name
from pos_freebie_options fo
join pos_freebie_rules fr on fr.id = fo.rule_id
join pos_artists pa on pa.id = fr.artist_id
where oi.freebie_option_id = fo.id
  and oi.artist_id is null;

-- 其餘真的無法對應的舊資料（商品或贈品規則後來被刪除，group_id/freebie_option_id
-- 已經是 null）維持 artist_id/artist_name 為 null，報表層會 fallback 回 pos_orders.artist_id。

-- ---------------------------------------------------------------------------
-- pos_orders 新增共用攤位標記。shared_group_id 為 null＝一般單一 Artist 訂單
-- （現有流程完全不變）；有值＝這張訂單是共用攤位結帳，pos_orders.artist_id 這時
-- 只保存「代表 Artist」（購物車第一項商品所屬 Artist）供舊畫面顯示用，報表/統計
-- 一律改以 pos_order_items.artist_id 為準，不可再用 pos_orders.artist_id 判斷
-- 共用訂單的商品歸屬。
-- ---------------------------------------------------------------------------
alter table pos_orders add column if not exists shared_group_id uuid references pos_artist_groups(id) on delete set null;
alter table pos_orders add column if not exists shared_group_name text;

alter table pos_artist_groups enable row level security;
alter table pos_artist_group_members enable row level security;

-- 全部只透過伺服器端 Service Role Key 存取（比照 021_pos_core.sql 其餘 pos_* 表），
-- 不開放 anon/authenticated 讀寫，因此不需要額外的 policy（RLS 開啟但沒有 policy＝
-- 一律拒絕 anon，service role 不受 RLS 限制）。角色權限（super_admin 可管理共用攤位／
-- sub_admin 依既有權限／staff 只能在 POS 使用）在應用層的 canAccessPosAdmin /
-- canManageAllData 判斷，跟其餘 pos_* 後台管理表完全一致，不需要在這裡另外處理。

-- ---------------------------------------------------------------------------
-- pos_checkout() 擴充：新增第 7 個參數 p_shared_group_id（預設 null）。
--
-- p_shared_group_id 為 null（現有呼叫方式，不用改任何既有呼叫端）：
--   驗證邏輯、贈品計算、找零，跟今天完全一樣，只多了 order_items 會自動填上
--   artist_id/artist_name（純新增欄位，不影響任何既有判斷）。
--
-- p_shared_group_id 有值：
--   - p_artist_id（代表 Artist）、每件商品所屬 Artist、每條贈品規則所屬 Artist，
--     都必須是這個群組的成員，且群組必須屬於同一個 p_event_id。
--   - 一張訂單、一個訂單編號、一次收款、一次找零——完全不會拆成多張訂單。
--   - 贈品額度改成依「規則所屬 Artist 自己在這張訂單的付費商品小計」分開計算，
--     不會把整張訂單的總額算給其中一位 Artist。
-- ---------------------------------------------------------------------------
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
  end if;

  v_order_number := next_order_number();

  insert into pos_orders (
    order_number, event_id, event_name, event_day_label, event_booth_number,
    artist_id, artist_name, staff_id, received_amount, shared_group_id, shared_group_name
  )
  values (
    v_order_number, p_event_id, v_event.name, v_event.day_label, v_event.booth_number,
    p_artist_id, v_artist.name, p_staff_id, p_received_amount,
    p_shared_group_id, v_shared_group.name
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

  -- 贈品處理：此時付費商品都已經寫入 pos_order_items，可以依 artist_id 算出
  -- 每位 Artist 自己的小計。spend_threshold 規則的額度池改成「這條規則所屬 Artist
  -- 自己的小計」，不是整張訂單的 v_subtotal；buy_product 規則的資格判斷本來就已經
  -- 是依 trigger_group_id 精準比對，不受共用攤位影響，維持原邏輯。
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
