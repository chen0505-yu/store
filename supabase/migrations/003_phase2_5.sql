-- Phase2.5 資料庫異動：
-- 1) 老師圖片／商品圖片改為 Supabase Storage 直接上傳，不再使用網址輸入框。
-- 2) 修正 Phase2 合併出貨邏輯：從「整張訂單」改為「逐件商品（Shipment Item）」，
--    讓同一張訂單裡已到貨的商品可以先出貨，未到貨的商品保留。
--
-- 若已執行過 supabase/migrations/002_phase2.sql，請在 Supabase SQL Editor 執行本檔案。

-- ---------------------------------------------------------------------------
-- Storage：建立公開圖片 bucket。
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('litan-images', 'litan-images', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Shipment Item：以「一件商品」為單位追蹤到貨／出貨狀態，
-- 取代 Phase2 綁在整張 order 上的 shipment_id / status 做法。
-- ---------------------------------------------------------------------------
do $$ begin
  create type shipment_item_status as enum (
    'not_arrived', 'arrived', 'packing', 'listed', 'completed'
  );
exception when duplicate_object then null;
end $$;

-- shipments 不再是「一張訂單一個出貨單」，改為多件商品的合併出貨批次。
alter table shipments drop column if exists order_id;
alter table shipments add column if not exists shipment_type order_type;
alter table shipments add column if not exists status shipment_item_status not null default 'packing';

-- orders 不再直接記錄 shipment_id，出貨批次改由 shipment_items 追蹤。
alter table orders drop constraint if exists orders_shipment_id_fkey;
alter table orders drop column if exists shipment_id;

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

alter table shipment_items enable row level security;

-- 為既有的 order_items 補建對應的 shipment_items（若之前已有測試訂單）。
-- 現貨一律視為已到貨（本來就有庫存）；預購依商品目前的到貨狀態決定初始狀態。
insert into shipment_items (order_item_id, order_id, order_type, status)
select
  oi.id,
  oi.order_id,
  o.order_type,
  case
    when o.order_type = 'instock' then 'arrived'
    when p.arrival_status = 'arrived' then 'arrived'
    else 'not_arrived'
  end::shipment_item_status
from order_items oi
join orders o on o.id = oi.order_id
left join products p on p.id = oi.product_id
where not exists (
  select 1 from shipment_items si where si.order_item_id = oi.id
);
