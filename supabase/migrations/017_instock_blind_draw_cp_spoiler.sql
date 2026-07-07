-- UAT Bug Fix：現貨商品設定跟預購一致——盲抽/滿抽保底、CP 防雷。
--
-- 跟預購（migration 015 的 product_groups/product_variants、migration 016 的 product_groups）
-- 完全對應的欄位，但開在現貨自己的 instock_product_groups / instock_product_variants 上，
-- 維持「預購與現貨必須完全分流」（不共用同一組表）。
--
-- 請在 Supabase SQL Editor 執行本檔案（承接 001~016）。

alter table instock_product_groups add column if not exists is_blind_draw boolean not null default false;
alter table instock_product_groups add column if not exists blind_draw_threshold_qty int;
alter table instock_product_groups add column if not exists blind_draw_pick_qty int;
alter table instock_product_groups add column if not exists is_cp_spoiler boolean not null default false;

alter table instock_product_variants add column if not exists is_bonus_option boolean not null default false;
