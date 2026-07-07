-- admin_users：後台管理員帳號，跟一般會員（members）、POS 員工（pos_staff）完全分開。
-- role：admin 可使用全部後台功能；artist（繪師）先預留角色，登入後只會看到「尚未開放」頁面，
-- 不會進到完整後台管理功能，之後如果要開放繪師自行上架商品再擴充。
do $$ begin
  create type admin_role as enum ('admin', 'artist');
exception when duplicate_object then null;
end $$;

create table if not exists admin_users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password_hash text not null,
  display_name text not null,
  role admin_role not null default 'admin',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists admin_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references admin_users(id) on delete cascade,
  token uuid unique not null default gen_random_uuid(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists admin_sessions_token_idx on admin_sessions(token);

-- payment_settings：客戶下單完成後、以及會員中心未付款/待確認訂單要顯示的匯款帳戶資訊。
-- 目前先只支援一組啟用帳戶：新增/切換啟用帳戶時，後台動作會把其他帳戶的 is_active 設回 false，
-- 不在資料庫層面用唯一索引限制，保留未來擴充多帳戶（例如依付款方式挑不同帳戶）的彈性。
create table if not exists payment_settings (
  id uuid primary key default gen_random_uuid(),
  bank_name text not null,
  bank_code text,
  account_name text not null,
  account_number text not null,
  remittance_note text,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table admin_users enable row level security;
alter table admin_sessions enable row level security;
alter table payment_settings enable row level security;
