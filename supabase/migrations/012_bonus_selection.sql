-- UAT Bug Fix 03（第 5 項）：盲抽滿額／滿抽選品功能。
--
-- 條件選品設定在「條件商品」本身（例如「盲抽」商品）：
--   bonus_enabled = true 代表這個商品買到一定數量可以挑保底/贈品，
--   bonus_threshold_qty = 每湊滿幾個才能選一次（例如 5），
--   bonus_pick_qty = 每湊滿一次可以選幾個（例如 1）。
-- 買 10 個（threshold 5 的兩倍）就能選 2 個，以此類推：可選數量 = floor(購買數量 / threshold) * pick_qty。
--
-- product_bonus_items：條件商品可以挑選的「保底/贈品商品清單」，多對多。
-- order_bonus_selections：客戶實際下單時選擇的保底/贈品，跟訂單一起儲存。
-- 商品名稱額外做快照，避免之後條件商品或保底商品被刪除時，訂單歷史紀錄跟著消失看不懂。
--
-- 請在 Supabase SQL Editor 執行本檔案（承接 001~011）。

alter table products add column if not exists bonus_enabled boolean not null default false;
alter table products add column if not exists bonus_threshold_qty int;
alter table products add column if not exists bonus_pick_qty int;

create table if not exists product_bonus_items (
  id uuid primary key default gen_random_uuid(),
  condition_product_id uuid not null references products(id) on delete cascade,
  bonus_product_id uuid not null references products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (condition_product_id, bonus_product_id)
);

create table if not exists order_bonus_selections (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  condition_product_id uuid references products(id) on delete set null,
  condition_product_name text not null,
  bonus_product_id uuid references products(id) on delete set null,
  bonus_product_name text not null,
  quantity int not null default 1,
  created_at timestamptz not null default now()
);

alter table product_bonus_items enable row level security;
alter table order_bonus_selections enable row level security;
-- 沒有公開讀取政策，一律只能透過 Service Role Key 存取（後端 Server Action / Server Component）。
