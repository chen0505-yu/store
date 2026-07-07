-- 訂單留言已讀/未讀狀態。
--
-- is_read 的「讀者」永遠是留言作者的另一方：
--   customer 留言 → is_read 代表「後台是否已讀」（決定 admin_unread_count）
--   admin 留言    → is_read 代表「客戶是否已讀」（決定 customer_unread_count）
-- 因此每則留言只需要一個 is_read 欄位，不需要拆成兩個已讀狀態。
--
-- 請在 Supabase SQL Editor 執行本檔案（承接 001~007）。

alter table order_messages add column if not exists is_read boolean not null default false;
