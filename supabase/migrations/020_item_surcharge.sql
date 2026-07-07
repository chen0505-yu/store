-- UAT Bug Fix：商品到貨後可設定「二補金額」，建立出貨訂單時自動帶入。
--
-- 設在品項（product_groups）跟細項（product_variants）兩層，細項若有設定（非 null）優先，
-- 否則 fallback 用品項的設定；兩者都沒設定就是 0（不自動產生二補）。
-- 二補金額可以是 0（代表已確認不需要追加，但仍想記錄原因），用 nullable 欄位跟「沒設定」區分。
--
-- 請在 Supabase SQL Editor 執行本檔案（承接 001~019）。

alter table product_groups add column if not exists surcharge_amount numeric(10, 2);
alter table product_groups add column if not exists surcharge_reason text;

alter table product_variants add column if not exists surcharge_amount numeric(10, 2);
alter table product_variants add column if not exists surcharge_reason text;
