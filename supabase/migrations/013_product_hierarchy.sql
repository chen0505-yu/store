-- UAT Bug Fix 04：商品架構改為 老師 → 品項（product_groups） → 細項（product_variants）。
--
-- 商品架構太扁平，改成符合實際營運方式的三層結構：
--   老師（teachers，新增預購時間欄位，全店共用一個預購期間）
--   └ 品項（product_groups，例如「小卡」「印刷品」「吊飾」，價格設在這一層）
--       └ 細項（product_variants，例如「白厄」「昔漣」「萬敵」，不另外設價格）
--
-- 這次只影響「預購」。現貨（instock）維持使用原本的 products 表，不受影響。
-- 舊的預購 products 資料（測試資料）不遷移，之後新品項一律用新結構上架。
--
-- 請在 Supabase SQL Editor 執行本檔案（承接 001~012）。

-- 老師賣場的預購時間：整間賣場共用一個預購期間，不用每個商品各自設定。
alter table teachers add column if not exists preorder_starts_at timestamptz;
alter table teachers add column if not exists preorder_ends_at timestamptz;

-- product_groups（品項）：商品價格設在這一層，例如「小卡 NT$20」。
-- arrival_status 沿用預購商品既有的 5 階段狀態（product_arrival_status），
-- 到貨追蹤以「品項」為單位，不需要每個細項各自追蹤。
create table if not exists product_groups (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references teachers(id) on delete cascade,
  name text not null,
  price numeric(10, 2) not null default 0,
  image_url text, -- 快取第一張圖片，列表主圖直接讀這欄位
  tags text[] not null default '{}',
  sort_order int not null default 0,
  arrival_status product_arrival_status not null default 'preordering',
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists product_group_images (
  id uuid primary key default gen_random_uuid(),
  product_group_id uuid not null references product_groups(id) on delete cascade,
  image_url text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- product_variants（細項）：例如「白厄」「昔漣」「萬敵」「盲抽」，通常不另外設定價格，
-- 沿用所屬品項（product_groups）的價格。
create table if not exists product_variants (
  id uuid primary key default gen_random_uuid(),
  product_group_id uuid not null references product_groups(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- order_items 新增品項/細項快照欄位。product_id 對現貨訂單繼續使用；
-- 預購訂單改用 product_group_id / product_variant_id，商品名稱、老師名稱、
-- 品項名稱、細項名稱、單價都在下單當下快照，不受之後編輯或刪除品項/細項影響。
-- subtotal 是 price * quantity 的資料庫算好欄位，讀取端不用每次自己重算。
alter table order_items add column if not exists product_group_id uuid references product_groups(id) on delete set null;
alter table order_items add column if not exists product_group_name text;
alter table order_items add column if not exists product_variant_id uuid references product_variants(id) on delete set null;
alter table order_items add column if not exists variant_name text;

do $$ begin
  alter table order_items add column subtotal numeric(10, 2) generated always as (price * quantity) stored;
exception when duplicate_column then null;
end $$;

alter table product_groups enable row level security;
alter table product_group_images enable row level security;
alter table product_variants enable row level security;

drop policy if exists "public read product groups" on product_groups;
create policy "public read product groups" on product_groups
  for select using (is_archived = false);

drop policy if exists "public read product group images" on product_group_images;
create policy "public read product group images" on product_group_images
  for select using (true);

drop policy if exists "public read product variants" on product_variants;
create policy "public read product variants" on product_variants
  for select using (is_active = true);
