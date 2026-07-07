-- UAT Bug Fix：CP 防雷——後台品項可以標記「是否 CP 防雷」，前台預設用模糊遮罩蓋住圖片，
-- 客人點一下才看到圖片；只影響圖片顯示，不影響商品名稱/價格/加入購物車。
--
-- 請在 Supabase SQL Editor 執行本檔案（承接 001~015）。

alter table product_groups add column if not exists is_cp_spoiler boolean not null default false;
