-- 平台調整：order_type 新增 'artist'，讓繪師預購訂單跟葴葴預購（'preorder'）、
-- 現貨（'instock'）用同一套 orders/order_items/shipments/shipment_items 機制，
-- 但完全分流查詢與統計（沿用現有 order_type 分流的做法，不用重新設計）。
alter type order_type add value if not exists 'artist';

-- 比照既有 instock_group_id/instock_variant_id 的模式：訂單快照商品名稱，
-- 繪師被停用或商品被刪除後，歷史訂單仍要正常顯示。
alter table order_items add column if not exists artist_group_id uuid references artist_product_groups(id) on delete set null;
alter table order_items add column if not exists artist_group_name text;
alter table order_items add column if not exists artist_variant_id uuid references artist_product_variants(id) on delete set null;
alter table order_items add column if not exists artist_variant_name text;
