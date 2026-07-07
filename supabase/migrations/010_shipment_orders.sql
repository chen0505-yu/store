-- 預購訂單合併後應轉成獨立的「出貨訂單」，而不是把原始預購訂單合併成一張普通訂單。
-- 原始預購訂單保留不變；出貨訂單（shipments）需要有自己的訂單編號、買家身分快照，
-- 讓後台「出貨訂單管理」與買家端「我的出貨訂單」都能直接顯示，不必每次重新 join 猜買家是誰。
--
-- 請在 Supabase SQL Editor 執行本檔案（承接 001~009）。

create sequence if not exists shipment_number_seq start 1;

create or replace function next_shipment_number()
returns text
language sql
as $$
  select 'SH' || lpad(nextval('shipment_number_seq')::text, 6, '0');
$$;

alter table shipments add column if not exists shipment_number text;
alter table shipments add column if not exists user_id uuid references members(id) on delete set null;
alter table shipments add column if not exists customer_name text;

-- 若既有出貨批次還沒有編號（本次修正前建立的資料），依建立時間補齊。
do $$
declare
  r record;
begin
  for r in select id from shipments where shipment_number is null order by created_at asc loop
    update shipments set shipment_number = next_shipment_number() where id = r.id;
  end loop;
end $$;

alter table shipments alter column shipment_number set not null;
alter table shipments alter column shipment_number set default next_shipment_number();

do $$ begin
  alter table shipments add constraint shipments_shipment_number_key unique (shipment_number);
exception when duplicate_object then null;
end $$;
