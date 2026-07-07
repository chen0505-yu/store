-- 測試資料：兩位老師，各自有一件預購商品與一件現貨商品，
-- 用來驗證 Phase1 的預購/現貨分流、庫存顯示、售完狀態等功能。
-- 於 Supabase SQL Editor 在 schema.sql 執行完畢後再執行。

insert into teachers (teacher_code, name, sort_order, is_active)
values
  ('T1A2B', '小狸老師', 1, true),
  ('T3C4D', '粉粉老師', 2, true)
on conflict (teacher_code) do nothing;

insert into products (teacher_id, name, type, price, arrival_status, tags)
select id, '狸貓壓克力吊飾', 'preorder', 350, 'not_arrived', array['吊飾', '狸貓']
from teachers where teacher_code = 'T1A2B';

insert into products (teacher_id, name, type, price, arrival_status, tags)
select id, '手繪明信片組', 'preorder', 280, 'arrived', array['明信片']
from teachers where teacher_code = 'T3C4D';

insert into products (teacher_id, name, type, price, stock_quantity, is_sold_out, tags)
select id, '限定徽章', 'instock', 150, 10, false, array['徽章']
from teachers where teacher_code = 'T1A2B';

insert into products (teacher_id, name, type, price, stock_quantity, is_sold_out, tags)
select id, '售完測試貼紙', 'instock', 60, 0, true, array['貼紙']
from teachers where teacher_code = 'T3C4D';
