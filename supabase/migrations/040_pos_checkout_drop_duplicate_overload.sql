-- 039 用 create or replace function 幫 pos_checkout() 新增第 7 個參數
-- p_shared_group_id，但 Postgres 的 function overloading 是依「參數簽名」比對，
-- 不是單純依函式名稱：新版本的參數列表跟舊版本不同，create or replace 並沒有真的
-- 「取代」舊函式，而是額外多建立了一個 6 參數的 overload，導致資料庫裡同時存在
-- 6 參數版與 7 參數版兩個 pos_checkout()。
--
-- 這會讓「沒有明確帶 p_shared_group_id」的呼叫撞到 PostgREST 無法決定要呼叫哪一個
-- 版本的錯誤（PGRST203 Could not choose the best candidate function）。正式程式
-- （src/lib/actions/pos-orders.ts 的 checkoutPosOrder）呼叫時本來就一律帶齊全部
-- 7 個具名參數，不受這個問題影響；這裡單純清掉多餘的舊版 6 參數 overload，
-- 避免資料庫裡留著一個容易誤用、行為又跟新版不一致的殘留函式。
--
-- 請在 Supabase SQL Editor 執行本檔案（承接 001~039）。

drop function if exists pos_checkout(uuid, uuid, uuid, numeric, jsonb, jsonb);
