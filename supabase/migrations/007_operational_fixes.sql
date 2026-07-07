-- 營運細節修正：
-- 1) 訂單留言（客戶/後台皆可留言，數量不限）
-- 2) 公告分類（固定四種：最新消息/出貨公告/活動公告/重要公告）
-- 3) 黑名單簡化（拿掉 blacklist_note，只留一個原因/備註欄位）
--
-- 請在 Supabase SQL Editor 執行本檔案（承接 001~006）。

-- ---------------------------------------------------------------------------
-- 1) 訂單留言
-- ---------------------------------------------------------------------------
do $$ begin
  create type order_message_author as enum ('customer', 'admin');
exception when duplicate_object then null;
end $$;

create table if not exists order_messages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  author_type order_message_author not null,
  content text not null,
  created_at timestamptz not null default now()
);

alter table order_messages enable row level security;

-- ---------------------------------------------------------------------------
-- 2) 公告分類
-- ---------------------------------------------------------------------------
do $$ begin
  create type announcement_category as enum ('news', 'shipping', 'event', 'important');
exception when duplicate_object then null;
end $$;

alter table announcements add column if not exists category announcement_category not null default 'news';

-- ---------------------------------------------------------------------------
-- 3) 黑名單簡化：拿掉 blacklist_note，只留 blacklist_reason 一個欄位。
--    黑名單基本上不會解除，不需要加入/解除日期或建立人欄位。
-- ---------------------------------------------------------------------------
alter table members drop column if exists blacklist_note;
