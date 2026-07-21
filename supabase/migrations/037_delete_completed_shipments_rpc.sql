-- 平台調整：「已完成訂單」批量永久刪除，比照 POS 模組既有的 plpgsql function +
-- for update 鎖 + raise exception 整批回滾寫法（見 pos_process_return /
-- pos_delete_event_cascade）。任何一筆出貨訂單不符合條件（未完成／未匯出過／還有未完成的
-- 匯款或補款）就整批中止，不會有部分刪除的狀況。
--
-- 刪除範圍：出貨訂單本身，以及「所有商品都在這次刪除範圍內」的原始訂單（連同底下的
-- order_items/payments/supplements/order_messages/order_bonus_selections，靠既有的
-- on delete cascade 外鍵自動清除）。如果一張訂單的商品分散在多張出貨單、這次只刪其中一張，
-- 訂單本身跟殘留在其他出貨單的商品都會保留，只清掉這次刪除範圍內的 shipment_items。
create or replace function delete_completed_shipments(p_shipment_ids uuid[])
returns jsonb
language plpgsql
as $$
declare
  v_id uuid;
  v_shipment shipments%rowtype;
  v_order_id uuid;
  v_deleted_shipment_count int := 0;
  v_deleted_order_count int := 0;
begin
  if p_shipment_ids is null or array_length(p_shipment_ids, 1) is null then
    raise exception '沒有選擇任何出貨訂單';
  end if;

  -- 第一階段：逐筆驗證，全部通過才會進入第二階段的實際刪除。
  for v_id in select unnest(p_shipment_ids)
  loop
    select * into v_shipment from shipments where id = v_id for update;
    if not found then
      raise exception '找不到出貨訂單（id: %）', v_id;
    end if;
    if v_shipment.status <> 'completed' then
      raise exception '出貨訂單 % 尚未完成，無法刪除', v_shipment.shipment_number;
    end if;
    if v_shipment.export_batch_id is null then
      raise exception '出貨訂單 % 尚未匯出 Excel，無法刪除', v_shipment.shipment_number;
    end if;

    if exists (
      select 1
      from shipment_items si
      join orders o on o.id = si.order_id
      where si.shipment_id = v_id
        and o.payment_status is not null
        and o.payment_status not in ('confirmed', 'cancelled')
    ) then
      raise exception '出貨訂單 % 仍有未完成的匯款，無法刪除', v_shipment.shipment_number;
    end if;

    if exists (
      select 1
      from shipment_items si
      join supplements s on s.order_id = si.order_id
      where si.shipment_id = v_id
        and s.status = 'pending'
    ) then
      raise exception '出貨訂單 % 仍有未完成的補款／二補，無法刪除', v_shipment.shipment_number;
    end if;
  end loop;

  -- 第二階段：實際刪除。
  for v_id in select unnest(p_shipment_ids)
  loop
    for v_order_id in
      select distinct order_id from shipment_items where shipment_id = v_id
    loop
      if not exists (
        select 1
        from shipment_items si2
        where si2.order_id = v_order_id
          and (si2.shipment_id is null or not (si2.shipment_id = any(p_shipment_ids)))
      ) then
        delete from orders where id = v_order_id;
        v_deleted_order_count := v_deleted_order_count + 1;
      end if;
    end loop;

    delete from shipment_items where shipment_id = v_id;
    delete from shipments where id = v_id;
    v_deleted_shipment_count := v_deleted_shipment_count + 1;
  end loop;

  return jsonb_build_object(
    'deleted_shipment_count', v_deleted_shipment_count,
    'deleted_order_count', v_deleted_order_count
  );
end;
$$;
