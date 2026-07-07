-- Phase2.9 資料庫異動：
-- 1) 現貨區開關 + 期間限定（全站設定）
-- 2) 預購商品截止時間（每個商品各自的開始/截止時間）
-- 3) 商品封存（軟刪除，不會真的刪除資料）
-- 4) 商品多圖片上傳
--
-- 請在 Supabase SQL Editor 執行本檔案（承接 001~004）。

-- ---------------------------------------------------------------------------
-- 1) 現貨區設定：全站只有一列
-- ---------------------------------------------------------------------------
create table if not exists instock_settings (
  id uuid primary key default gen_random_uuid(),
  is_open boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into instock_settings (is_open)
select false
where not exists (select 1 from instock_settings);

alter table instock_settings enable row level security;
drop policy if exists "public read instock settings" on instock_settings;
create policy "public read instock settings" on instock_settings
  for select using (true);

-- ---------------------------------------------------------------------------
-- 2) 預購商品時間窗 + 3) 商品封存
-- ---------------------------------------------------------------------------
alter table products add column if not exists preorder_starts_at timestamptz;
alter table products add column if not exists preorder_ends_at timestamptz;
alter table products add column if not exists is_archived boolean not null default false;

-- 封存商品不對外公開，更新公開讀取政策納入這個條件。
drop policy if exists "public read products" on products;
create policy "public read products" on products
  for select using (is_archived = false);

-- ---------------------------------------------------------------------------
-- 4) 商品多圖片
-- ---------------------------------------------------------------------------
create table if not exists product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  image_url text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table product_images enable row level security;
drop policy if exists "public read product images" on product_images;
create policy "public read product images" on product_images
  for select using (true);

-- 既有商品若已經有 image_url，補一筆對應的 product_images，維持列表/詳細頁一致。
insert into product_images (product_id, image_url, sort_order)
select id, image_url, 0
from products
where image_url is not null
  and not exists (select 1 from product_images pi where pi.product_id = products.id);
