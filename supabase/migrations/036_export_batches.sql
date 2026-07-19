-- 平台調整：每次「已完成訂單」批量匯出 Excel 建立一筆批次紀錄，方便追蹤誰在什麼時候
-- 匯出了哪些出貨訂單（shipments.export_batch_id 指向這裡）。
create table if not exists export_batches (
  id uuid primary key default gen_random_uuid(),
  exported_by_admin_id uuid references admin_users(id) on delete set null,
  exported_by_label text,
  row_count int not null default 0,
  created_at timestamptz not null default now()
);

alter table export_batches enable row level security;
