-- 活動刪除改成「整場活動全部清空」，符合現場流程：活動結束 → Excel 全部匯出 →
-- 自行備份 → 整個活動清空 → 建立下一場活動。不再是「保留歷史，不能刪」。
--
-- pos_orders.event_id 跟 pos_returns.order_id 都是 on delete restrict（故意設計成
-- 保護資料，見 021/026 的註解），所以不能直接 delete from pos_events 了事，要先手動
-- 由下往上刪：退貨明細 → 退貨紀錄 → 訂單（連帶 cascade 掉 pos_order_items）→ 活動本身
-- （連帶 cascade 掉 pos_artists → pos_product_groups/variants、pos_freebie_rules/options，
-- 這幾層在 021/025 都已經是 on delete cascade，不用在這裡重複處理）。
-- 整段包在一個 function 裡確保單一交易、要嘛全部刪掉、要嘛全部不動。
--
-- 請在 Supabase SQL Editor 執行本檔案（承接 001~028）。

create or replace function pos_delete_event_cascade(p_event_id uuid)
returns void
language plpgsql
as $$
begin
  delete from pos_return_items
  where return_id in (
    select r.id
    from pos_returns r
    join pos_orders o on o.id = r.order_id
    where o.event_id = p_event_id
  );

  delete from pos_returns
  where order_id in (select id from pos_orders where event_id = p_event_id);

  delete from pos_orders where event_id = p_event_id;

  delete from pos_events where id = p_event_id;
end;
$$;
