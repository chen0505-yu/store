-- payments.actual_amount：客戶實際匯款金額（取代原本要求客戶自行計算「少匯款多少」的作法，
-- 避免客戶誤把實際匯款金額填進「少匯款」欄位，造成後台看到錯誤的少匯款金額）。
-- 少匯款金額一律由「訂單總額 - actual_amount」即時計算，不再另外儲存。
alter table payments add column if not exists actual_amount numeric(10, 2);

-- 回填既有資料：舊資料只有 underpaid_amount（少匯款多少），用「訂單總額 - underpaid_amount」
-- 換算回實際匯款金額，讓舊訂單在新顯示邏輯下數字維持不變。
update payments p
set actual_amount = o.total_amount - coalesce(p.underpaid_amount, 0)
from orders o
where p.order_id = o.id
  and p.actual_amount is null;

-- shipments.printed_at：後台批量列印出貨單後標記「已列印」，方便辨識哪些出貨單已經印過
-- （允許重複列印，只是提醒用，不做任何列印次數限制）。
alter table shipments add column if not exists printed_at timestamptz;
