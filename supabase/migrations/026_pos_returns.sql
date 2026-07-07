-- 退貨功能。可以整張訂單退（把所有商品都選進去）或只退單一/部分品項，
-- 退貨原因選填。退貨會把庫存加回去（商品退商品庫存、贈品退贈品庫存），
-- 原訂單（pos_orders / pos_order_items）完全不會被修改或刪除，退貨另外開一筆紀錄。
--
-- 換貨：規格上是「退掉原商品，再加入新商品」——退貨用這裡的 pos_process_return()，
-- 新商品直接用既有的 POS 收銀畫面（pos_checkout()）重新結帳即可，兩者是各自獨立、
-- 各自都保證單一交易的操作，不用把退貨跟新結帳硬綁在同一個交易裡。
--
-- 請在 Supabase SQL Editor 執行本檔案（承接 001~025）。

create table if not exists pos_returns (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references pos_orders(id) on delete restrict,
  staff_id uuid references pos_staff(id) on delete set null,
  reason text, -- 選填，前台給建議選項（換商品/客人不要/結錯帳/商品瑕疵/其他），存文字方便彈性
  refund_amount numeric(10, 2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists pos_returns_order_id_idx on pos_returns(order_id);

create table if not exists pos_return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references pos_returns(id) on delete cascade,
  order_item_id uuid not null references pos_order_items(id) on delete restrict,
  quantity int not null,
  refund_amount numeric(10, 2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists pos_return_items_return_id_idx on pos_return_items(return_id);
create index if not exists pos_return_items_order_item_id_idx on pos_return_items(order_item_id);

alter table pos_returns enable row level security;
alter table pos_return_items enable row level security;

-- pos_process_return：單一交易處理一筆退貨（可以是整張訂單或部分品項）。
-- 依「這個 order_item 已經退過幾件」擋下超退；商品退商品庫存、贈品退贈品庫存；
-- 任何一步失敗（找不到訂單/明細、超退、數量不正確）整筆 rollback，原訂單資料完全不動。
create or replace function pos_process_return(
  p_order_id uuid,
  p_staff_id uuid,
  p_reason text,
  p_items jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_order record;
  v_return_id uuid;
  v_item jsonb;
  v_order_item_id uuid;
  v_quantity int;
  v_order_item record;
  v_already_returned int;
  v_remaining int;
  v_refund_amount numeric := 0;
  v_item_refund numeric;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception '請選擇要退貨的商品';
  end if;

  select * into v_order from pos_orders where id = p_order_id;
  if not found then
    raise exception '找不到訂單';
  end if;

  insert into pos_returns (order_id, staff_id, reason, refund_amount)
  values (p_order_id, p_staff_id, nullif(trim(coalesce(p_reason, '')), ''), 0)
  returning id into v_return_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_order_item_id := (v_item->>'orderItemId')::uuid;
    v_quantity := (v_item->>'quantity')::int;

    if v_quantity is null or v_quantity <= 0 then
      raise exception '退貨數量不正確';
    end if;

    select * into v_order_item from pos_order_items where id = v_order_item_id for update;
    if not found or v_order_item.order_id <> p_order_id then
      raise exception '找不到訂單明細';
    end if;

    select coalesce(sum(quantity), 0) into v_already_returned
    from pos_return_items
    where order_item_id = v_order_item_id;

    v_remaining := v_order_item.quantity - v_already_returned;
    if v_quantity > v_remaining then
      raise exception '「%」最多只能退 % 件', v_order_item.group_name, v_remaining;
    end if;

    if v_order_item.is_freebie then
      if v_order_item.freebie_option_id is not null then
        update pos_freebie_options set stock_quantity = stock_quantity + v_quantity where id = v_order_item.freebie_option_id;
      end if;
    else
      if v_order_item.group_id is not null then
        update pos_product_groups set stock_quantity = stock_quantity + v_quantity where id = v_order_item.group_id;
      end if;
    end if;

    v_item_refund := v_order_item.unit_price * v_quantity;
    v_refund_amount := v_refund_amount + v_item_refund;

    insert into pos_return_items (return_id, order_item_id, quantity, refund_amount)
    values (v_return_id, v_order_item_id, v_quantity, v_item_refund);
  end loop;

  update pos_returns set refund_amount = v_refund_amount where id = v_return_id;

  return jsonb_build_object('returnId', v_return_id, 'refundAmount', v_refund_amount);
end;
$$;
