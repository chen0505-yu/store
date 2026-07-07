-- LITAN Platform 資料庫結構
-- 對應 docs/03_Database.md，於 Supabase SQL Editor 執行。
-- 欄位依 Phase 標註：Phase1 使用中 / Phase2、Phase3 先建表供後續階段使用。

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- members：正式會員帳號。手機號碼+密碼登入，不使用簡訊驗證/OTP/第三方付費驗證。
-- 取代 Phase1 的訪客 cookie 機制（users 表）。
-- ---------------------------------------------------------------------------
-- 黑名單刻意保持簡單：只有是否黑名單 + 一個原因/備註欄位，沒有加入/解除日期、
-- 建立人或解除流程，因為黑名單基本上不會解除。
create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  phone text unique not null,
  password_hash text not null,
  fb_name text not null,
  fb_profile_url text,
  is_blacklisted boolean not null default false,
  blacklist_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- member_sessions：登入 session，cookie 只存不透明 token，查這張表換回 member_id。
create table if not exists member_sessions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  token text unique not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- member_addresses：保留未來收件資料擴充用的資料表，目前沒有對應 UI
-- （客戶到賣貨便下單，平台暫不需要收件資料）。
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

-- ---------------------------------------------------------------------------
-- teachers：Teacher Master，Teacher ID 使用 4~6 碼短 UUID (teacher_code)。
-- Phase1 先建表，Phase2 才會有後台管理介面。
-- ---------------------------------------------------------------------------
-- preorder_starts_at / preorder_ends_at：整間老師賣場共用一個預購期間，
-- 底下所有品項／細項都共用，不需要每個商品各自設定預購時間。
create table if not exists teachers (
  id uuid primary key default gen_random_uuid(),
  teacher_code text unique not null,
  name text not null,
  avatar_url text,
  social_url text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  preorder_starts_at timestamptz,
  preorder_ends_at timestamptz,
  allow_event_pickup boolean not null default false,
  created_at timestamptz not null default now()
);

-- teacher_images：老師賣場封面圖（老師層級，不是每個細項各自的圖片），
-- 第一張（sort_order 最小）當作前台老師卡片封面，賣場頁可以顯示多張。
create table if not exists teacher_images (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references teachers(id) on delete cascade,
  image_url text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- event_pickup_options：活動現場取貨選項（例如 FF 第一天），開放與否設在 teachers.allow_event_pickup。
create table if not exists event_pickup_options (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references teachers(id) on delete cascade,
  event_name text not null,
  session_name text,
  display_name text not null,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

do $$ begin
  create type product_type as enum ('preorder', 'instock');
exception when duplicate_object then null;
end $$;

-- Phase2.8：預購商品狀態擴充為 5 個階段（不用「已到貨」，改用「已到台」）：
-- 預購中 → 未到貨 → 已到台 → 整理中 → 已開賣貨便
do $$ begin
  create type product_arrival_status as enum (
    'preordering', 'not_arrived', 'arrived', 'packing', 'listed'
  );
exception when duplicate_object then null;
end $$;

alter type product_arrival_status add value if not exists 'preordering';
alter type product_arrival_status add value if not exists 'packing';
alter type product_arrival_status add value if not exists 'listed';

-- ---------------------------------------------------------------------------
-- products：type 決定預購/現貨。arrival_status 只用於預購，stock_quantity 只用於現貨。
-- sort_order 供同一位老師底下的商品拖曳排序使用。
-- Phase2.9：
--   preorder_starts_at / preorder_ends_at：只用於預購，控制客人是否能下單
--     （與 arrival_status 的到貨追蹤是兩件事，互不影響）。
--   is_archived：封存商品，前台完全不顯示，後台一般清單也不顯示。
-- ---------------------------------------------------------------------------
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references teachers(id) on delete set null,
  name text not null,
  type product_type not null,
  price numeric(10, 2) not null default 0,
  image_url text, -- 快取第一張圖片（見 product_images），列表主圖直接讀這欄位
  arrival_status product_arrival_status, -- 只用於預購
  stock_quantity int, -- 只用於現貨
  is_sold_out boolean not null default false,
  tags text[] not null default '{}',
  sort_order int not null default 0,
  preorder_starts_at timestamptz, -- 只用於預購，null 代表「即日起」無限制
  preorder_ends_at timestamptz, -- 只用於預購，null 代表沒有截止日
  is_archived boolean not null default false,
  -- 條件選品（例如盲抽買滿 5 抽選 1 張保底）：設定在條件商品本身。
  -- 可選數量 = floor(購買數量 / bonus_threshold_qty) * bonus_pick_qty。
  bonus_enabled boolean not null default false,
  bonus_threshold_qty int,
  bonus_pick_qty int,
  created_at timestamptz not null default now()
);

-- product_images：商品可上傳多張圖片，sort_order 決定顯示順序，
-- 第一張（sort_order 最小）同步快取到 products.image_url 作為列表主圖。
create table if not exists product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  image_url text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- product_bonus_items：條件商品可以挑選的保底/贈品商品清單，多對多。
create table if not exists product_bonus_items (
  id uuid primary key default gen_random_uuid(),
  condition_product_id uuid not null references products(id) on delete cascade,
  bonus_product_id uuid not null references products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (condition_product_id, bonus_product_id)
);

-- ---------------------------------------------------------------------------
-- 預購商品架構（UAT Bug Fix 04）：老師 → 品項（product_groups） → 細項（product_variants）。
-- 只用於預購，現貨繼續使用上面的 products 表，兩者互不影響。
-- 商品價格設在「品項」這一層（例如「小卡 NT$20」），細項（白厄/昔漣/萬敵）不另外設價格，
-- 到貨追蹤（arrival_status）也以「品項」為單位。
-- ---------------------------------------------------------------------------
create table if not exists product_groups (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references teachers(id) on delete cascade,
  name text not null,
  price numeric(10, 2) not null default 0,
  image_url text,
  tags text[] not null default '{}',
  sort_order int not null default 0,
  arrival_status product_arrival_status not null default 'preordering',
  is_archived boolean not null default false,
  -- 盲抽/滿抽選品：買滿 blind_draw_threshold_qty 抽可以選 blind_draw_pick_qty 個保底細項，
  -- 每達成一次門檻可再多選（例如買 5 抽選 1 個、買 10 抽選 2 個）。可選的細項見 product_variants.is_bonus_option。
  is_blind_draw boolean not null default false,
  blind_draw_threshold_qty int,
  blind_draw_pick_qty int,
  -- CP 防雷：前台預設模糊遮罩蓋住圖片，客人點一下才看到圖片，不影響名稱/價格/加入購物車。
  is_cp_spoiler boolean not null default false,
  -- 二補金額：商品到貨後才知道需要追加補款，設在品項/細項上，建立出貨訂單時自動帶入補款紀錄。
  -- nullable 代表「未設定」，跟「設定為 0」區分開來。
  surcharge_amount numeric(10, 2),
  surcharge_reason text,
  created_at timestamptz not null default now()
);

create table if not exists product_group_images (
  id uuid primary key default gen_random_uuid(),
  product_group_id uuid not null references product_groups(id) on delete cascade,
  image_url text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists product_variants (
  id uuid primary key default gen_random_uuid(),
  product_group_id uuid not null references product_groups(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  -- 這個細項是否為盲抽可選的保底選項（見 product_groups.is_blind_draw）。
  is_bonus_option boolean not null default false,
  -- 細項層級的二補金額，若設定（非 null）優先於品項層級的設定。
  surcharge_amount numeric(10, 2),
  surcharge_reason text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 現貨商品架構（UAT Bug Fix：現貨也改成老師/品項/細項）：老師 → 品項
-- （instock_product_groups） → 細項（instock_product_variants）。跟預購完全獨立建表，
-- 維持「預購與現貨必須完全分流」。現貨不需要 arrival_status／預購時間窗，
-- 改成庫存記在細項這一層。
-- ---------------------------------------------------------------------------
create table if not exists instock_product_groups (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references teachers(id) on delete cascade,
  name text not null,
  price numeric(10, 2) not null default 0,
  image_url text,
  tags text[] not null default '{}',
  sort_order int not null default 0,
  is_archived boolean not null default false,
  is_blind_draw boolean not null default false,
  blind_draw_threshold_qty int,
  blind_draw_pick_qty int,
  is_cp_spoiler boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists instock_product_group_images (
  id uuid primary key default gen_random_uuid(),
  instock_product_group_id uuid not null references instock_product_groups(id) on delete cascade,
  image_url text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists instock_product_variants (
  id uuid primary key default gen_random_uuid(),
  instock_product_group_id uuid not null references instock_product_groups(id) on delete cascade,
  name text not null,
  stock_quantity int not null default 0,
  is_sold_out boolean not null default false,
  sort_order int not null default 0,
  is_active boolean not null default true,
  is_bonus_option boolean not null default false,
  created_at timestamptz not null default now()
);

-- product_tags：保留供未來標籤管理介面使用，Phase1 標籤直接存於 products.tags。
create table if not exists product_tags (
  id uuid primary key default gen_random_uuid(),
  name text unique not null
);

-- instock_settings：現貨區開關與期間限定，全站只有一列設定。
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

-- 既有商品若已經有 image_url，補一筆對應的 product_images，維持列表/詳細頁一致。
insert into product_images (product_id, image_url, sort_order)
select id, image_url, 0
from products
where image_url is not null
  and not exists (select 1 from product_images pi where pi.product_id = products.id);

do $$ begin
  create type order_type as enum ('preorder', 'instock');
exception when duplicate_object then null;
end $$;

-- 訂單編號序號：LT000001 格式（docs/06_Order_Flow.md）
create sequence if not exists order_number_seq start 1;

create or replace function next_order_number()
returns text
language sql
as $$
  select 'LT' || lpad(nextval('order_number_seq')::text, 6, '0');
$$;

-- 預購訂單的匯款/付款狀態，只有「已確認」的訂單才能列入「預購商品品項總數」統計。
-- 現貨訂單不使用這個欄位（現貨不需要匯款、不需要補款）。
do $$ begin
  create type preorder_payment_status as enum (
    'not_remitted', 'pending_payment', 'remitted', 'remittance_confirmed',
    'supplement_completed', 'cancelled',
    'pending_confirmation', 'confirmed', 'underpaid', 'needs_supplement'
  );
exception when duplicate_object then null;
end $$;

alter type preorder_payment_status add value if not exists 'pending_confirmation';
alter type preorder_payment_status add value if not exists 'confirmed';
alter type preorder_payment_status add value if not exists 'underpaid';
alter type preorder_payment_status add value if not exists 'needs_supplement';

-- ---------------------------------------------------------------------------
-- orders：order_type 讓預購與現貨訂單完全分流查詢與統計。
-- 出貨批次不綁在 order 上（見下方 shipment_items），一張訂單裡的商品可以分批出貨。
-- user_id 指向正式會員（members），不再是訪客 cookie。
-- ---------------------------------------------------------------------------
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique not null,
  user_id uuid references members(id) on delete set null,
  order_type order_type not null,
  status text not null default 'pending',
  total_amount numeric(10, 2) not null default 0,
  customer_name text, -- Phase2：出貨單需要顯示客戶名稱
  payment_status preorder_payment_status, -- 只用於預購，現貨恆為 null
  marketplace_order_number text, -- 現貨訂單，買家自行填入的賣貨便訂單編號
  pickup_method text check (pickup_method in ('shipment', 'event_pickup')), -- 只用於預購：取貨方式
  event_pickup_option_id uuid references event_pickup_options(id) on delete set null,
  event_pickup_display_name text, -- 快照，避免之後選項被刪改時訂單歷史紀錄看不懂
  created_at timestamptz not null default now()
);

-- product_group_id / product_variant_id + 對應的 name 快照欄位：只用於預購（新的
-- 老師/品項/細項架構），現貨繼續用 product_id + product_name。快照商品名稱、老師名稱、
-- 品項名稱、細項名稱、單價，避免之後編輯或刪除品項/細項/老師資料影響歷史訂單顯示。
-- subtotal 是資料庫算好的 price * quantity，讀取端不用自己重算。
create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  product_name text not null,
  teacher_name text,
  teacher_code text, -- Phase2：出貨單需要顯示 Teacher ID
  product_group_id uuid references product_groups(id) on delete set null,
  product_group_name text,
  product_variant_id uuid references product_variants(id) on delete set null,
  variant_name text,
  instock_group_id uuid references instock_product_groups(id) on delete set null,
  instock_variant_id uuid references instock_product_variants(id) on delete set null,
  quantity int not null,
  price numeric(10, 2) not null,
  subtotal numeric(10, 2) generated always as (price * quantity) stored,
  created_at timestamptz not null default now()
);

-- order_bonus_selections：客戶下單時選擇的條件選品（保底/贈品），跟訂單一起儲存。
-- 商品名稱額外做快照，避免之後條件商品或保底商品被刪除時，訂單歷史紀錄跟著看不懂。
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

-- payments：只用於預購訂單的匯款資訊，一張訂單一筆紀錄（客戶重新提交會覆蓋更新）。
-- underpaid_amount：舊欄位，少匯款多少，保留給歷史資料，不再寫入新值。
-- actual_amount：客戶實際匯款金額，少匯款金額改由「訂單總額 - actual_amount」即時計算。
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  remittance_date date,
  remittance_time time,
  account_last5 text,
  screenshot_url text,
  underpaid_amount numeric(10, 2),
  actual_amount numeric(10, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  alter table payments add constraint payments_order_id_key unique (order_id);
exception when duplicate_object then null;
end $$;

-- supplements：到貨後開賣貨便賣場需要客戶補差額，只由後台建立與修改，客戶只能查看。
do $$ begin
  create type supplement_status as enum ('pending', 'completed', 'not_needed', 'cancelled');
exception when duplicate_object then null;
end $$;

-- payment_method：有些補款會在貨到後透過賣貨便/貨到付款方式處理，不一定是匯款補款。
do $$ begin
  create type supplement_payment_method as enum ('remittance', 'cod');
exception when duplicate_object then null;
end $$;

create table if not exists supplements (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  amount numeric(10, 2) not null default 0,
  reason text,
  status supplement_status not null default 'pending',
  payment_method supplement_payment_method not null default 'remittance',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- admin_users：後台管理員帳號，跟一般會員（members）、POS 員工（pos_staff）完全分開。
-- role：admin 可使用全部後台功能；artist（繪師）先預留角色，登入後只會看到「尚未開放」頁面。
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
-- 目前先只支援一組啟用帳戶，切換啟用帳戶時由後台動作把其他帳戶的 is_active 設回 false。
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

-- announcements：後台發布的公告/最新消息，分類固定只有以下四種。
do $$ begin
  create type announcement_category as enum ('news', 'shipping', 'event', 'important');
exception when duplicate_object then null;
end $$;

create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  category announcement_category not null default 'news',
  is_pinned boolean not null default false,
  is_public boolean not null default true,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- order_messages：訂單留言，客戶與後台都可以留言，數量不限。
-- is_read 的「讀者」永遠是留言作者的另一方：customer 留言的已讀狀態代表「後台是否已讀」，
-- admin 留言的已讀狀態代表「客戶是否已讀」，因此每則留言只需要一個 is_read 欄位。
do $$ begin
  create type order_message_author as enum ('customer', 'admin');
exception when duplicate_object then null;
end $$;

create table if not exists order_messages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  author_type order_message_author not null,
  content text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- stock_logs：只用於現貨庫存異動紀錄。product_id 是舊的扁平商品結構留下的欄位（可為空），
-- 新流程改寫 instock_variant_id（老師/品項/細項架構下的細項）。
create table if not exists stock_logs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,
  instock_variant_id uuid references instock_product_variants(id) on delete set null,
  change_qty int not null,
  reason text not null,
  created_at timestamptz not null default now()
);

do $$ begin
  create type shipment_item_status as enum (
    'not_arrived', 'arrived', 'packing', 'listed', 'completed'
  );
exception when duplicate_object then null;
end $$;

-- shipment_number：出貨訂單編號 SH000001 格式，比照 orders.order_number 的做法。
create sequence if not exists shipment_number_seq start 1;

create or replace function next_shipment_number()
returns text
language sql
as $$
  select 'SH' || lpad(nextval('shipment_number_seq')::text, 6, '0');
$$;

-- shipments：合併預購訂單後建立的獨立「出貨訂單」，不綁定單一 order，而是掛在
-- shipment_items 底下（多筆商品，可能來自同一買家的不同訂單/不同老師）。
-- 同一批次只會是同一種 shipment_type（現貨不可與預購合併），且只屬於同一位買家（user_id）。
-- 原始預購訂單（orders）不會被刪除或修改，出貨訂單是另外新增的一筆紀錄。
-- marketplace_order_number：出貨訂單「已開賣貨便」後，買家回填的賣貨便訂單編號，
-- 綁定在出貨訂單本身，不是單一商品或單一預購訂單，因為一筆出貨訂單可能包含買家的多筆平台訂單。
create table if not exists shipments (
  id uuid primary key default gen_random_uuid(),
  shipment_number text unique not null default next_shipment_number(),
  shipment_type order_type not null,
  status shipment_item_status not null default 'packing',
  user_id uuid references members(id) on delete set null,
  customer_name text,
  marketplace_order_number text,
  shipped_at timestamptz,
  printed_at timestamptz,
  created_at timestamptz not null default now()
);

-- shipment_items：合併出貨的最小單位是「一件商品」，不是「一張訂單」。
-- 同一張訂單裡，已到貨的商品可以先合併出貨，未到貨的商品保留、等到貨後再出。
create table if not exists shipment_items (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null unique references order_items(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  order_type order_type not null,
  status shipment_item_status not null default 'not_arrived',
  shipment_id uuid references shipments(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- votes / vote_items：Phase3 投票系統使用，投票沒有價格、庫存、購物車。
create table if not exists votes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references teachers(id) on delete cascade,
  title text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists vote_items (
  id uuid primary key default gen_random_uuid(),
  vote_id uuid not null references votes(id) on delete cascade,
  category text not null, -- 小卡/色紙/印刷品/吊飾/徽章/壓克力/其他
  image_url text,
  vote_count int not null default 0
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Phase1 所有資料存取都經由 Server Actions / Server Components 使用
-- service role key（會繞過 RLS）。這裡先開啟 RLS 並只開放商城前台需要的
-- 公開讀取權限，為之後導入瀏覽器端 anon client 預作準備。
-- ---------------------------------------------------------------------------
alter table product_bonus_items enable row level security;
alter table order_bonus_selections enable row level security;
alter table product_groups enable row level security;
alter table product_group_images enable row level security;
alter table product_variants enable row level security;
alter table teacher_images enable row level security;
alter table event_pickup_options enable row level security;
alter table instock_product_groups enable row level security;
alter table instock_product_group_images enable row level security;
alter table instock_product_variants enable row level security;
alter table members enable row level security;
alter table member_sessions enable row level security;
alter table member_addresses enable row level security;
alter table teachers enable row level security;
alter table products enable row level security;
alter table product_images enable row level security;
alter table instock_settings enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table payments enable row level security;
alter table supplements enable row level security;
alter table announcements enable row level security;
alter table order_messages enable row level security;
alter table stock_logs enable row level security;
alter table shipments enable row level security;
alter table shipment_items enable row level security;
alter table votes enable row level security;
alter table vote_items enable row level security;
alter table admin_users enable row level security;
alter table admin_sessions enable row level security;
alter table payment_settings enable row level security;

-- members/member_sessions/member_addresses/payments/supplements 沒有公開讀取政策，
-- 一律只能透過 Service Role Key 存取（後端 Server Action / Server Component）。

drop policy if exists "public read teachers" on teachers;
create policy "public read teachers" on teachers
  for select using (is_active = true);

drop policy if exists "public read teacher images" on teacher_images;
create policy "public read teacher images" on teacher_images
  for select using (true);

drop policy if exists "public read event pickup options" on event_pickup_options;
create policy "public read event pickup options" on event_pickup_options
  for select using (is_active = true);

drop policy if exists "public read products" on products;
create policy "public read products" on products
  for select using (is_archived = false);

drop policy if exists "public read product images" on product_images;
create policy "public read product images" on product_images
  for select using (true);

drop policy if exists "public read product groups" on product_groups;
create policy "public read product groups" on product_groups
  for select using (is_archived = false);

drop policy if exists "public read product group images" on product_group_images;
create policy "public read product group images" on product_group_images
  for select using (true);

drop policy if exists "public read product variants" on product_variants;
create policy "public read product variants" on product_variants
  for select using (is_active = true);

drop policy if exists "public read instock product groups" on instock_product_groups;
create policy "public read instock product groups" on instock_product_groups
  for select using (is_archived = false);

drop policy if exists "public read instock product group images" on instock_product_group_images;
create policy "public read instock product group images" on instock_product_group_images
  for select using (true);

drop policy if exists "public read instock product variants" on instock_product_variants;
create policy "public read instock product variants" on instock_product_variants
  for select using (is_active = true);

drop policy if exists "public read instock settings" on instock_settings;
create policy "public read instock settings" on instock_settings
  for select using (true);

drop policy if exists "public read announcements" on announcements;
create policy "public read announcements" on announcements
  for select using (is_public = true and is_archived = false);

-- ---------------------------------------------------------------------------
-- Storage：老師頭像／商品圖片（未來投票圖片）改為直接上傳到 Supabase Storage，
-- 不再使用網址輸入框。上傳一律透過後台 Server Action 使用 Service Role Key，
-- 會繞過 RLS；下載則因為 bucket 設為 public，直接用公開網址存取即可。
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('litan-images', 'litan-images', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 同人活動 POS 系統：活動現場代理繪師收銀販售，跟預購/現貨網路商城完全獨立
-- （不同的人員、商品、庫存、訂單、報表），只是同一個 Supabase 專案，資料表加 pos_ 前綴。
-- 訂單編號沿用 next_order_number()，POS 訂單與網路商城訂單共用同一組流水號序列。
-- 對應 migrations 021/024/025。
-- ---------------------------------------------------------------------------
do $$ begin
  create type pos_staff_role as enum ('super_admin', 'sub_admin', 'staff');
exception when duplicate_object then null;
end $$;

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

create table if not exists pos_events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_date date,
  day_label text,
  booth_number text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists pos_artists (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references pos_events(id) on delete cascade,
  artist_code text unique not null,
  name text not null,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- pos_product_groups/variants：商品主項 + 細項。細項自 migration 024 起改為純後台記錄用途，
-- 不再參與 POS 前台結帳流程（結帳只扣主項 stock_quantity）。
create table if not exists pos_product_groups (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references pos_artists(id) on delete cascade,
  name text not null,
  price numeric(10, 2) not null default 0,
  image_url text,
  note text,
  stock_quantity int not null default 0,
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

-- pos_freebie_rules/options：滿額贈品／指定商品贈品（migration 025）。
do $$ begin
  create type pos_freebie_rule_type as enum ('spend_threshold', 'buy_product');
exception when duplicate_object then null;
end $$;

create table if not exists pos_freebie_rules (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references pos_artists(id) on delete cascade,
  name text not null,
  rule_type pos_freebie_rule_type not null,
  threshold_amount numeric(10, 2),
  trigger_group_id uuid references pos_product_groups(id) on delete cascade,
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

-- pos_checkout：POS 結帳唯一入口（建立訂單 + 逐項扣庫存 + 寫入明細 + 贈品資格判斷），
-- 靠 plpgsql 隱含交易 + `for update` 列鎖，避免現場多台收銀同時搶同一件商品庫存時超賣。
-- 這是 migration 025（Phase 2 贈品版本）的最終版本，取代 021/024 的舊版本。
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

-- pos_set_event_active：同時只有一個「目前活動」，設定某活動為目前活動時，
-- 順便把其他活動都設回非目前活動。
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
alter table pos_freebie_rules enable row level security;
alter table pos_freebie_options enable row level security;

-- ⚠️ 安全性提醒：以下 seed 會建立一組帳號密碼寫死在原始碼裡的預設超級管理員帳號
-- （帳號 admin／密碼 LitanPos2026!），只給第一次設定 POS 系統時使用。
-- 正式上線前務必登入 /pos/admin/staff 立刻改密碼或改用其他帳號，不要繼續使用這組預設密碼。
insert into pos_staff (username, password_hash, display_name, role)
values (
  'admin',
  crypt('LitanPos2026!', gen_salt('bf')),
  '超級管理員',
  'super_admin'
)
on conflict (username) do nothing;
