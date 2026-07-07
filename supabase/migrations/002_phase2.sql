-- Phase2 資料庫異動：老師底下管理商品、到貨後合併出貨、A4 出貨單。
-- 若已在 Phase1 執行過 supabase/schema.sql，請在 Supabase SQL Editor 執行本檔案；
-- 全新安裝則直接執行最新版 supabase/schema.sql 即可（已包含以下異動)。

-- 出貨單需要客戶名稱與合併出貨批次
alter table orders add column if not exists customer_name text;
alter table orders add column if not exists shipment_id uuid;

-- 出貨單需要顯示 Teacher ID，於建立訂單當下把商品所屬老師代碼一併存下來
alter table order_items add column if not exists teacher_code text;

-- shipments 原本是 1:1 對應 order_id，Phase2 改為一個出貨批次可包含多筆訂單
alter table shipments drop column if exists order_id;
alter table shipments add column if not exists shipment_type order_type;

do $$ begin
  alter table orders
    add constraint orders_shipment_id_fkey
    foreign key (shipment_id) references shipments(id) on delete set null;
exception when duplicate_object then null;
end $$;
