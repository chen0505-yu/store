-- 新增功能：活動現場取貨（CWT/FF/布穀町/NiCE 等，可能有第一天/第二天）。
--
-- 開放與否設在「老師預購賣場」層級（teachers.allow_event_pickup），跟預購時間窗同一層級。
-- 開放後，後台可以在該老師底下新增多個取貨選項（event_pickup_options），例如「FF 第一天」。
-- 客人下單時可選擇取貨方式（賣貨便配送／活動現場取貨），選現場取貨時要選一個場次，
-- 存在 orders 上；display_name 額外做快照，避免之後選項被刪除/修改時訂單歷史紀錄看不懂。
--
-- 二補功能沿用既有 supplements 表（本來就是「到貨後補差額」的設計），不需要新表；
-- 只是額外開放從「出貨訂單」層級也能建立/查看，並在買家出貨訂單頁面提示應補金額。
--
-- 請在 Supabase SQL Editor 執行本檔案（承接 001~017）。

alter table teachers add column if not exists allow_event_pickup boolean not null default false;

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

alter table orders add column if not exists pickup_method text check (pickup_method in ('shipment', 'event_pickup'));
alter table orders add column if not exists event_pickup_option_id uuid references event_pickup_options(id) on delete set null;
alter table orders add column if not exists event_pickup_display_name text;

alter table event_pickup_options enable row level security;

drop policy if exists "public read event pickup options" on event_pickup_options;
create policy "public read event pickup options" on event_pickup_options
  for select using (is_active = true);
