-- Phase2.8 資料庫異動：
-- 1) 預購商品狀態擴充為 5 階段（預購中／未到貨／已到台／整理中／已開賣貨便）。
-- 2) 現貨訂單改為買家自行完成賣貨便並回填「賣貨便訂單編號」，不再使用 shipment_items 合併出貨。
-- 3) 商品新增 sort_order，供同一位老師底下的商品拖曳排序。
-- 4) 預購訂單新增 payment_status，只有符合條件的付款狀態才能列入「預購商品品項總數」統計。
--
-- 請在 Supabase SQL Editor 執行本檔案（承接 001、002、003）。

-- ---------------------------------------------------------------------------
-- 1) 預購商品狀態擴充
-- ---------------------------------------------------------------------------
alter type product_arrival_status add value if not exists 'preordering';
alter type product_arrival_status add value if not exists 'packing';
alter type product_arrival_status add value if not exists 'listed';

-- ---------------------------------------------------------------------------
-- 2) 現貨訂單：不再使用 shipment_items（現貨改成買家自行完成賣貨便並回填訂單編號）
-- ---------------------------------------------------------------------------
alter table orders add column if not exists marketplace_order_number text;
delete from shipment_items where order_type = 'instock';

-- ---------------------------------------------------------------------------
-- 3) 商品拖曳排序
-- ---------------------------------------------------------------------------
alter table products add column if not exists sort_order int not null default 0;

-- ---------------------------------------------------------------------------
-- 4) 預購付款狀態（僅預購訂單使用，現貨恆為 null）
-- ---------------------------------------------------------------------------
do $$ begin
  create type preorder_payment_status as enum (
    'not_remitted', 'pending_payment', 'remitted', 'remittance_confirmed',
    'supplement_completed', 'cancelled'
  );
exception when duplicate_object then null;
end $$;

alter table orders add column if not exists payment_status preorder_payment_status;

-- 既有的預購訂單如果還沒有付款狀態，預設為「待付款」（不會被計入統計）。
update orders set payment_status = 'pending_payment'
where order_type = 'preorder' and payment_status is null;

-- 既有預購商品若還是舊的 not_arrived 初始值，維持原狀即可（不強制改成 preordering），
-- 新建立的商品會從應用程式端直接以 'preordering' 建立。
