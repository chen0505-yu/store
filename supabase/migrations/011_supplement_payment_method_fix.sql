-- UAT Bug Fix 03（第 2 項）：後台新增補款時報錯
-- "Could not find the 'payment_method' column of 'supplements'"
--
-- 這個欄位其實已經寫在 009_bugfix01.sql 裡，這支 migration 單獨拉出來、
-- 全部使用 if not exists，不管有沒有跑過 009 都可以安全重複執行，
-- 用來直接解除這個報錯，不需要再去確認 009 是否執行過。
--
-- 請在 Supabase SQL Editor 執行本檔案。

do $$ begin
  create type supplement_payment_method as enum ('remittance', 'cod');
exception when duplicate_object then null;
end $$;

alter table supplements
  add column if not exists payment_method supplement_payment_method not null default 'remittance';
