-- Phase3（會員/公告/黑名單/匯款/補款）資料庫異動：
-- 1) 正式會員系統（手機+密碼），取代訪客 cookie 的 users 表
-- 2) 公告 / 最新消息
-- 3) 黑名單欄位（在 members 上）
-- 4) 匯款資料重新設計（新增少匯款欄位，一張訂單一筆紀錄）
-- 5) 補款（後台建立，客戶只能查看）
--
-- 請在 Supabase SQL Editor 執行本檔案（承接 001~005）。

-- ---------------------------------------------------------------------------
-- 1) 會員系統
-- ---------------------------------------------------------------------------
create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  phone text unique not null,
  password_hash text not null,
  fb_name text not null,
  fb_profile_url text,
  is_blacklisted boolean not null default false,
  blacklist_reason text,
  blacklist_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists member_sessions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  token text unique not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- 保留未來收件資料擴充用，目前沒有對應 UI。
create table if not exists member_addresses (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  recipient_name text,
  phone text,
  address text,
  store_type text,
  store_code text,
  created_at timestamptz not null default now()
);

-- orders.user_id 改指向 members；既有測試訂單的訪客關聯直接清空重來。
alter table orders drop constraint if exists orders_user_id_fkey;
update orders set user_id = null;
alter table orders add constraint orders_user_id_fkey
  foreign key (user_id) references members(id) on delete set null;

drop table if exists users cascade;

-- ---------------------------------------------------------------------------
-- 2) 公告 / 最新消息
-- ---------------------------------------------------------------------------
create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  is_pinned boolean not null default false,
  is_public boolean not null default true,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4) 匯款資料重新設計
-- ---------------------------------------------------------------------------
alter table payments drop column if exists is_supplement;
alter table payments add column if not exists underpaid_amount numeric(10, 2);
alter table payments add column if not exists updated_at timestamptz not null default now();

do $$ begin
  alter table payments add constraint payments_order_id_key unique (order_id);
exception when duplicate_object then null;
end $$;

-- 付款狀態擴充：新增待確認/已確認/少匯款/需補款。
alter type preorder_payment_status add value if not exists 'pending_confirmation';
alter type preorder_payment_status add value if not exists 'confirmed';
alter type preorder_payment_status add value if not exists 'underpaid';
alter type preorder_payment_status add value if not exists 'needs_supplement';

update orders set payment_status = 'not_remitted'
where order_type = 'preorder' and payment_status is null;

-- ---------------------------------------------------------------------------
-- 5) 補款
-- ---------------------------------------------------------------------------
do $$ begin
  create type supplement_status as enum ('pending', 'completed', 'not_needed', 'cancelled');
exception when duplicate_object then null;
end $$;

create table if not exists supplements (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  amount numeric(10, 2) not null default 0,
  reason text,
  status supplement_status not null default 'pending',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table members enable row level security;
alter table member_sessions enable row level security;
alter table member_addresses enable row level security;
alter table announcements enable row level security;
alter table supplements enable row level security;

drop policy if exists "public read announcements" on announcements;
create policy "public read announcements" on announcements
  for select using (is_public = true and is_archived = false);
