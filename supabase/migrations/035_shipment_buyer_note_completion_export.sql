-- 平台調整：出貨訂單新增買家備註、完成訂單記錄（完成時間/完成者角色）、
-- 匯出 Excel 紀錄（匯出時間/匯出批次 id，供「已完成訂單」頁面批量匯出後永久刪除使用）。
alter table shipments add column if not exists buyer_note text;
alter table shipments add column if not exists completed_at timestamptz;
alter table shipments add column if not exists completed_by_role text
  check (completed_by_role in ('member', 'artist', 'super_admin'));
alter table shipments add column if not exists completed_by_label text; -- 顯示用，例如會員暱稱或管理員名稱
alter table shipments add column if not exists exported_at timestamptz;
alter table shipments add column if not exists export_batch_id uuid;

create index if not exists shipments_export_batch_id_idx on shipments(export_batch_id);
