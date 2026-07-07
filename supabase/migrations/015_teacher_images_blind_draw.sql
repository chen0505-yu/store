-- UAT Bug Fix：老師賣場封面圖（多張）+ 盲抽/滿抽選品功能。
--
-- 一、老師賣場封面圖：跟 product_group_images 一樣的模式，老師層級（不是細項各自的圖片），
--    第一張當作老師卡片封面，賣場頁可以顯示多張。
--
-- 二、盲抽：設定在「品項」（product_groups）這一層——是否為盲抽、每買幾抽、可選幾個保底；
--    可選的保底細項則標記在該品項底下的「細項」（product_variants）上。
--    客戶的保底選擇沿用既有的 order_bonus_selections 表（migration 012 已建立，
--    condition_product_id / bonus_product_id 這兩個舊 FK 欄位對新架構不適用，繼續留 null，
--    只用 condition_product_name（品項名稱）/ bonus_product_name（細項名稱）兩個文字快照欄位即可）。
--
-- 請在 Supabase SQL Editor 執行本檔案（承接 001~014）。

create table if not exists teacher_images (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references teachers(id) on delete cascade,
  image_url text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table product_groups add column if not exists is_blind_draw boolean not null default false;
alter table product_groups add column if not exists blind_draw_threshold_qty int;
alter table product_groups add column if not exists blind_draw_pick_qty int;

alter table product_variants add column if not exists is_bonus_option boolean not null default false;

alter table teacher_images enable row level security;

drop policy if exists "public read teacher images" on teacher_images;
create policy "public read teacher images" on teacher_images
  for select using (true);
