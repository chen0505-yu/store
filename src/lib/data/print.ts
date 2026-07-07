import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { OrderBonusSelectionView } from "@/lib/types";

export interface PrintOrderItem {
  productName: string;
  teacherName: string | null;
  teacherCode: string | null;
  quantity: number;
}

// 一張出貨單代表一筆「出貨訂單」（shipment），只屬於一位買家，
// 但可能包含這位買家好幾筆不同的平台預購訂單編號（合併出貨後陸續到台的商品）。
export interface PrintOrder {
  id: string;
  shipmentNumber: string;
  customerName: string | null;
  orderNumbers: string[];
  marketplaceOrderNumber: string | null;
  items: PrintOrderItem[];
  bonusSelections: OrderBonusSelectionView[]; // 客戶選擇的保底/贈品，列印出貨單時要顯示避免包貨漏掉
  pickupMethod: "shipment" | "event_pickup" | null;
  eventPickupDisplayName: string | null;
}

interface ShipmentItemRow {
  order_item_id: string;
  order_id: string;
}

interface OrderItemLookupRow {
  id: string;
  product_name: string;
  teacher_name: string | null;
  teacher_code: string | null;
  quantity: number;
}

interface OrderLookupRow {
  id: string;
  order_number: string;
  pickup_method: "shipment" | "event_pickup" | null;
  event_pickup_display_name: string | null;
}

// A4 四分之一出貨單所需資料。列印範圍是「這些出貨訂單裡的商品」，
// 不是單一預購訂單——同一張預購訂單如果還有商品在其他出貨訂單（尚未到貨），不會出現在這裡。
// 支援批量列印：一次帶入多筆 shipmentId，依序產生多張出貨單。
export async function getShipmentsForPrint(shipmentIds: string[]): Promise<PrintOrder[]> {
  const supabase = getSupabaseServerClient();
  const ids = Array.from(new Set(shipmentIds.filter(Boolean)));
  if (!supabase || ids.length === 0) return [];

  const { data: shipments } = await supabase
    .from("shipments")
    .select("id, shipment_number, customer_name, marketplace_order_number")
    .in("id", ids);

  if (!shipments || shipments.length === 0) return [];

  const { data: shipmentItems, error } = await supabase
    .from("shipment_items")
    .select("shipment_id, order_item_id, order_id")
    .in("shipment_id", ids);

  if (error || !shipmentItems || shipmentItems.length === 0) return [];

  const rows = shipmentItems as (ShipmentItemRow & { shipment_id: string })[];
  const orderItemIds = rows.map((r) => r.order_item_id);
  const orderIds = Array.from(new Set(rows.map((r) => r.order_id)));

  const [{ data: orderItems }, { data: orders }, { data: bonusSelections }] = await Promise.all([
    supabase
      .from("order_items")
      .select("id, product_name, teacher_name, teacher_code, quantity")
      .in("id", orderItemIds),
    supabase
      .from("orders")
      .select("id, order_number, pickup_method, event_pickup_display_name")
      .in("id", orderIds),
    supabase
      .from("order_bonus_selections")
      .select("order_id, condition_product_name, bonus_product_name, quantity")
      .in("order_id", orderIds),
  ]);

  const orderItemMap = new Map<string, OrderItemLookupRow>(
    ((orderItems ?? []) as OrderItemLookupRow[]).map((oi) => [oi.id, oi])
  );
  const orderMap = new Map<string, OrderLookupRow>(
    ((orders ?? []) as OrderLookupRow[]).map((o) => [o.id, o])
  );
  const bonusSelectionsByOrderId = new Map<string, OrderBonusSelectionView[]>();
  for (const b of bonusSelections ?? []) {
    const list = bonusSelectionsByOrderId.get(b.order_id) ?? [];
    list.push({
      conditionProductName: b.condition_product_name,
      bonusProductName: b.bonus_product_name,
      quantity: b.quantity,
    });
    bonusSelectionsByOrderId.set(b.order_id, list);
  }

  const rowsByShipment = new Map<string, (ShipmentItemRow & { shipment_id: string })[]>();
  for (const r of rows) {
    const list = rowsByShipment.get(r.shipment_id) ?? [];
    list.push(r);
    rowsByShipment.set(r.shipment_id, list);
  }

  const result: PrintOrder[] = [];
  for (const shipment of shipments) {
    const shipmentRows = rowsByShipment.get(shipment.id) ?? [];
    const orderNumbers: string[] = [];
    const shipmentOrderIds = new Set<string>();
    const items: PrintOrderItem[] = [];
    for (const r of shipmentRows) {
      const oi = orderItemMap.get(r.order_item_id);
      const order = orderMap.get(r.order_id);
      if (!oi || !order) continue;

      if (!orderNumbers.includes(order.order_number)) {
        orderNumbers.push(order.order_number);
      }
      shipmentOrderIds.add(r.order_id);
      items.push({
        productName: oi.product_name,
        teacherName: oi.teacher_name,
        teacherCode: oi.teacher_code,
        quantity: oi.quantity,
      });
    }
    if (items.length === 0) continue;

    const bonusSelectionsForShipment = Array.from(shipmentOrderIds).flatMap(
      (orderId) => bonusSelectionsByOrderId.get(orderId) ?? []
    );

    // 取貨方式聚合：只要合併進來的任一筆訂單是現場取貨，整筆出貨單就算現場取貨（跟後台出貨訂單頁一致）。
    const eventPickupOrder = Array.from(shipmentOrderIds)
      .map((id) => orderMap.get(id))
      .find((o) => o?.pickup_method === "event_pickup");

    result.push({
      id: shipment.id,
      shipmentNumber: shipment.shipment_number,
      customerName: shipment.customer_name,
      orderNumbers,
      marketplaceOrderNumber: shipment.marketplace_order_number,
      items,
      bonusSelections: bonusSelectionsForShipment,
      pickupMethod: eventPickupOrder ? "event_pickup" : shipmentOrderIds.size > 0 ? "shipment" : null,
      eventPickupDisplayName: eventPickupOrder?.event_pickup_display_name ?? null,
    });
  }

  // 依傳入的 shipmentIds 順序排列，讓勾選順序跟列印順序一致。
  const orderById = new Map(result.map((r) => [r.id, r]));
  return ids.map((id) => orderById.get(id)).filter((r): r is PrintOrder => Boolean(r));
}

export interface InstockPrintOrderItem {
  productName: string;
  teacherName: string | null;
  teacherCode: string | null;
  quantity: number;
}

export interface InstockPrintOrder {
  id: string;
  orderNumber: string;
  customerName: string | null;
  marketplaceOrderNumber: string | null;
  items: InstockPrintOrderItem[];
}

interface InstockOrderRow {
  id: string;
  order_number: string;
  customer_name: string | null;
  marketplace_order_number: string | null;
  order_items: { product_name: string; teacher_name: string | null; teacher_code: string | null; quantity: number }[] | null;
}

function mapInstockOrderRow(order: InstockOrderRow): InstockPrintOrder | null {
  const items = (order.order_items ?? []).map((it) => ({
    productName: it.product_name,
    teacherName: it.teacher_name,
    teacherCode: it.teacher_code,
    quantity: it.quantity,
  }));
  if (items.length === 0) return null;

  return {
    id: order.id,
    orderNumber: order.order_number,
    customerName: order.customer_name,
    marketplaceOrderNumber: order.marketplace_order_number,
    items,
  };
}

// 現貨訂單列印：現貨沒有出貨訂單合併流程，直接列印單筆平台訂單本身的商品明細。
export async function getInstockOrderForPrint(orderId: string): Promise<InstockPrintOrder | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase || !orderId) return null;

  const { data: order, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, customer_name, marketplace_order_number, order_items(product_name, teacher_name, teacher_code, quantity)"
    )
    .eq("id", orderId)
    .eq("order_type", "instock")
    .maybeSingle();

  if (error || !order) return null;

  return mapInstockOrderRow(order as unknown as InstockOrderRow);
}

// 批量列印：一次帶入多筆現貨訂單 id，依勾選順序產生多張列印頁，一張 A4 放四張。
export async function getInstockOrdersForPrint(orderIds: string[]): Promise<InstockPrintOrder[]> {
  const supabase = getSupabaseServerClient();
  const ids = Array.from(new Set(orderIds.filter(Boolean)));
  if (!supabase || ids.length === 0) return [];

  const { data: orders, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, customer_name, marketplace_order_number, order_items(product_name, teacher_name, teacher_code, quantity)"
    )
    .in("id", ids)
    .eq("order_type", "instock");

  if (error || !orders) return [];

  const orderById = new Map(
    (orders as unknown as InstockOrderRow[])
      .map((o) => [o.id, mapInstockOrderRow(o)] as const)
      .filter((entry): entry is [string, InstockPrintOrder] => Boolean(entry[1]))
  );

  return ids.map((id) => orderById.get(id)).filter((o): o is InstockPrintOrder => Boolean(o));
}
