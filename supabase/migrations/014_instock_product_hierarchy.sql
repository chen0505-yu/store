-- UAT Bug Fix：現貨商品也改成 老師 → 品項（instock_product_groups） → 細項（instock_product_variants）。
--
-- 跟預購（migration 013）一樣的架構思路，但完全獨立建表，不與預購共用
-- product_groups / product_variants，維持「預購與現貨必須完全分流」。
-- 現貨不需要 arrival_status／預購時間窗，改成庫存記在細項（instock_product_variants）上。
--
-- 舊的現貨 products 資料（測試資料、已封存商品）不遷移，仍可在「已封存商品」頁查看/刪除；
-- 之後新現貨商品一律用新結構上架。
--
-- 請在 Supabase SQL Editor 執行本檔案（承接 001~013）。

create table if not exists instock_product_groups (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references teachers(id) on delete cascade,
  name text not null,
  price numeric(10, 2) not null default 0,
  image_url text, -- 快取第一張圖片，列表主圖直接讀這欄位
  tags text[] not null default '{}',
  sort_order int not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists instock_product_group_images (
  id uuid primary key default gen_random_uuid(),
  instock_product_group_id uuid not null references instock_product_groups(id) on delete cascade,
  image_url text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- instock_product_variants（細項）：例如「白厄」「昔漣」「萬敵」，庫存記在這一層，
-- 沿用所屬品項（instock_product_groups）的價格。
create table if not exists instock_product_variants (
  id uuid primary key default gen_random_uuid(),
  instock_product_group_id uuid not null references instock_product_groups(id) on delete cascade,
  name text not null,
  stock_quantity int not null default 0,
  is_sold_out boolean not null default false,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- order_items 新增現貨品項/細項快照欄位，比照預購（product_group_id/product_variant_id）的做法，
-- 但用獨立的 FK 欄位指向現貨專用的表，避免混用不同表的 id。product_group_name / variant_name
-- 兩個文字快照欄位（migration 013 新增）本來就是通用顯示欄位，現貨也直接沿用不用再新增。
alter table order_items add column if not exists instock_group_id uuid references instock_product_groups(id) on delete set null;
alter table order_items add column if not exists instock_variant_id uuid references instock_product_variants(id) on delete set null;

-- stock_logs 原本綁定舊的 products 表，改成可以記錄現貨細項（instock_product_variants）的庫存異動；
-- product_id 放寬為可空值，新流程改寫 instock_variant_id。
alter table stock_logs alter column product_id drop not null;
alter table stock_logs add column if not exists instock_variant_id uuid references instock_product_variants(id) on delete set null;

alter table instock_product_groups enable row level security;
alter table instock_product_group_images enable row level security;
alter table instock_product_variants enable row level security;

drop policy if exists "public read instock product groups" on instock_product_groups;
create policy "public read instock product groups" on instock_product_groups
  for select using (is_archived = false);

drop policy if exists "public read instock product group images" on instock_product_group_images;
create policy "public read instock product group images" on instock_product_group_images
  for select using (true);

drop policy if exists "public read instock product variants" on instock_product_variants;
create policy "public read instock product variants" on instock_product_variants
  for select using (is_active = true);
