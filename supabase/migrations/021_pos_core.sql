-- 同人活動 POS 系統（Phase 1）：活動現場代理繪師收銀販售，跟原本預購/現貨網路商城
-- 完全獨立（不同的人員、商品、庫存、訂單、報表），只是同一個 Supabase 專案，資料表加 pos_ 前綴。
--
-- 訂單編號沿用既有 next_order_number()（LT000001 格式），POS 訂單與網路商城訂單共用同一組
-- 流水號序列，確保全平台訂單編號不會撞號，同時符合 CLAUDE.md「訂單編號格式 LT000001」的規則。
--
-- 請在 Supabase SQL Editor 執行本檔案（承接 001~020）。

create extension if not exists pgcrypto;

do $$ begin
  create type pos_staff_role as enum ('super_admin', 'sub_admin', 'staff');
exception when duplicate_object then null;
end $$;

-- pos_staff：POS 專用的員工帳號，跟 members（一般會員）完全分開。
create table if not exists pos_staff (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password_hash text not null,
  display_name text not null,
  role pos_staff_role not null default 'staff',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists pos_staff_sessions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references pos_staff(id) on delete cascade,
  token uuid unique not null default gen_random_uuid(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists pos_staff_sessions_token_idx on pos_staff_sessions(token);

-- pos_events：CWT69 Day1、FF45 這類單場活動。現場流程是「每次活動前重新整理 POS 系統」，
-- 同一時間只會有一個 is_active=true 的「目前活動」，前台不需要選活動畫面，
-- 直接用目前活動 + 攤位號 + 繪師名稱組成畫面上的麵包屑（見 day_label/booth_number）。
create table if not exists pos_events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_date date,
  day_label text, -- 例如 Day1 / Day2，可留空
  booth_number text, -- 例如 A01，可留空
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- pos_artists：活動底下的繪師，跟 teachers（網路商城老師）完全獨立的資料，
-- 命名刻意使用 artist（繪師），不沿用網路商城的 teacher 命名。
create table if not exists pos_artists (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references pos_events(id) on delete cascade,
  artist_code text unique not null,
  name text not null,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 商品改成兩層結構：pos_product_groups（商品主項/分類，例如「小卡」）
-- + pos_product_variants（商品細項，例如「Sunday」）。
-- POS 前台只顯示主項（避免畫面太複雜），有細項的商品結帳時才跳出選擇視窗。
--
-- 庫存規則（應用層計算，不存 generated column，避免兩份庫存打架）：
--   - 這個主項底下有任何細項列 → 主項庫存 = 所有細項庫存加總，group.stock_quantity 不使用。
--   - 沒有細項列（單純商品，不需要選細項）→ 直接使用 group.stock_quantity。
-- ---------------------------------------------------------------------------
create table if not exists pos_product_groups (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references pos_artists(id) on delete cascade,
  name text not null,
  price numeric(10, 2) not null default 0,
  image_url text,
  note text, -- 備註，例如「每人限購2」「只能送不能賣」，POS 要清楚顯示提醒小幫手
  stock_quantity int not null default 0, -- 只在沒有細項時使用
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists pos_product_groups_artist_id_idx on pos_product_groups(artist_id);

create table if not exists pos_product_variants (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references pos_product_groups(id) on delete cascade,
  name text not null,
  stock_quantity int not null default 0,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists pos_product_variants_group_id_idx on pos_product_variants(group_id);

-- pos_orders：現場現金結帳訂單。event_name/event_day_label/event_booth_number/artist_name
-- 是下單當下的快照：現場每次活動前會重新整理 pos_events/pos_artists 資料（改名、覆用同一列），
-- 如果訂單畫面只靠 event_id/artist_id join 顯示，之後改了活動名稱會連歷史訂單都跟著變，
-- 所以額外存一份文字快照，FK 仍保留給依活動/繪師篩選用。
create table if not exists pos_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique not null,
  event_id uuid not null references pos_events(id) on delete restrict,
  event_name text not null,
  event_day_label text,
  event_booth_number text,
  artist_id uuid not null references pos_artists(id) on delete restrict,
  artist_name text not null,
  staff_id uuid references pos_staff(id) on delete set null,
  subtotal_amount numeric(10, 2) not null default 0,
  total_amount numeric(10, 2) not null default 0,
  received_amount numeric(10, 2) not null default 0,
  change_amount numeric(10, 2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists pos_orders_event_id_idx on pos_orders(event_id);
create index if not exists pos_orders_artist_id_idx on pos_orders(artist_id);
create index if not exists pos_orders_created_at_idx on pos_orders(created_at);

-- pos_order_items：商品主項/細項名稱與單價皆為下單當下的快照。variant_id/variant_name
-- 在該商品沒有細項時維持 null（不用硬塞一個假的細項名稱）。
-- is_freebie / returned_quantity 是 Phase 2（滿額贈品、退換貨）會用到的欄位，先加上避免屆時要改表結構，
-- Phase 1 一律寫入預設值（false / 0），尚未有對應功能。
create table if not exists pos_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references pos_orders(id) on delete cascade,
  group_id uuid references pos_product_groups(id) on delete set null,
  group_name text not null,
  variant_id uuid references pos_product_variants(id) on delete set null,
  variant_name text,
  unit_price numeric(10, 2) not null,
  quantity int not null,
  subtotal numeric(10, 2) generated always as (unit_price * quantity) stored,
  is_freebie boolean not null default false,
  returned_quantity int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists pos_order_items_order_id_idx on pos_order_items(order_id);

-- pos_checkout：POS 結帳的唯一入口，整筆訂單（建立訂單 + 逐項扣庫存 + 寫入明細）
-- 都在同一個 function 內完成，靠 plpgsql 的隱含交易 + `for update` 列鎖，
-- 避免現場多台收銀同時搶同一件商品/細項庫存時超賣，任何一步失敗都會整筆回滾
-- （建立訂單但沒扣到庫存、或庫存扣了但訂單沒成立的情況都不會發生）。
-- p_items 格式：[{"group_id": "...", "variant_id": "..." 或 null, "quantity": 2}, ...]
create or replace function pos_checkout(
  p_event_id uuid,
  p_artist_id uuid,
  p_staff_id uuid,
  p_received_amount numeric,
  p_items jsonb
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
  v_variant_id uuid;
  v_quantity int;
  v_group record;
  v_variant record;
  v_variant_name text;
  v_subtotal numeric := 0;
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
    v_variant_id := nullif(v_item->>'variant_id', '')::uuid;
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

    if v_variant_id is not null then
      select * into v_variant from pos_product_variants where id = v_variant_id for update;
      if not found or v_variant.group_id <> v_group_id then
        raise exception '找不到商品細項';
      end if;
      if v_variant.stock_quantity < v_quantity then
        raise exception '「% - %」庫存不足', v_group.name, v_variant.name;
      end if;

      update pos_product_variants set stock_quantity = stock_quantity - v_quantity where id = v_variant_id;
      v_variant_name := v_variant.name;
    else
      if exists (select 1 from pos_product_variants where group_id = v_group_id) then
        raise exception '「%」需要選擇細項', v_group.name;
      end if;
      if v_group.stock_quantity < v_quantity then
        raise exception '「%」庫存不足', v_group.name;
      end if;

      update pos_product_groups set stock_quantity = stock_quantity - v_quantity where id = v_group_id;
      v_variant_name := null;
    end if;

    insert into pos_order_items (order_id, group_id, group_name, variant_id, variant_name, unit_price, quantity)
    values (v_order_id, v_group_id, v_group.name, v_variant_id, v_variant_name, v_group.price, v_quantity);

    v_subtotal := v_subtotal + (v_group.price * v_quantity);
  end loop;

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

-- pos_set_event_active：現場心智模型是「同時只有一個目前活動」，設定某個活動為目前活動時，
-- 順便把其他活動都設回非目前活動，後台不需要複雜的活動切換 UI。
create or replace function pos_set_event_active(p_event_id uuid)
returns void
language plpgsql
as $$
begin
  update pos_events set is_active = false where id <> p_event_id;
  update pos_events set is_active = true where id = p_event_id;
end;
$$;

alter table pos_staff enable row level security;
alter table pos_staff_sessions enable row level security;
alter table pos_events enable row level security;
alter table pos_artists enable row level security;
alter table pos_product_groups enable row level security;
alter table pos_product_variants enable row level security;
alter table pos_orders enable row level security;
alter table pos_order_items enable row level security;

-- 全部只透過伺服器端 Service Role Key 存取（比照 orders/members 等表），不開放 anon 讀寫，
-- 因此不需要額外的 policy（RLS 開啟但沒有 policy = 一律拒絕 anon，service role 不受 RLS 限制）。

-- 預設超級管理員帳號，方便第一次登入後台建立其他員工帳號。
-- 帳號：admin / 密碼：LitanPos2026！請在正式使用前立刻登入 /pos/admin/staff 更改密碼或另建帳號。
insert into pos_staff (username, password_hash, display_name, role)
values (
  'admin',
  crypt('LitanPos2026!', gen_salt('bf')),
  '超級管理員',
  'super_admin'
)
on conflict (username) do nothing;
