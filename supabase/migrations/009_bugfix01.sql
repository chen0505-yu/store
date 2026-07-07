-- UAT Bug Fix 01：補款付款方式、合併出貨批次的賣貨便訂單編號。
--
-- 補款新增「付款方式」欄位：匯款補款 / 貨到付款。
-- 賣貨便訂單編號改為綁定在「合併出貨批次」(shipments) 上，而不是單一商品或單一訂單，
-- 因為同一個出貨批次可能包含同一買家的多筆平台訂單。
--
-- 請在 Supabase SQL Editor 執行本檔案（承接 001~008）。

do $$ begin
  create type supplement_payment_method as enum ('remittance', 'cod');
exception when duplicate_object then null;
end $$;

alter table supplements
  add column if not exists payment_method supplement_payment_method not null default 'remittance';

alter table shipments
  add column if not exists marketplace_order_number text;
