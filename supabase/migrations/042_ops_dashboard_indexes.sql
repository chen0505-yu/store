-- 營運 Dashboard／後台列表查詢效能索引。純新增 index，不改變任何欄位、資料或商業邏輯，
-- 可安全重複執行（if not exists），不影響現有讀寫行為。
create index if not exists orders_type_payment_status_idx
on orders(order_type, payment_status);

create index if not exists orders_type_status_idx
on orders(order_type, status);

create index if not exists orders_created_at_idx
on orders(created_at);

create index if not exists shipment_items_type_status_idx
on shipment_items(order_type, status);

create index if not exists order_messages_unread_idx
on order_messages(is_read, author_type);

create index if not exists artist_product_groups_arrival_status_idx
on artist_product_groups(arrival_status);
