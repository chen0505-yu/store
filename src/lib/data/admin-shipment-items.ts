import { getSupabaseServerClient } from "@/lib/supabase/server";
import type {
  OrderBonusSelectionView,
  OrderMessageView,
  OrderType,
  PaymentView,
  PreorderPaymentStatus,
  SupplementView,
} from "@/lib/types";
import type { ShipmentItemStatus } from "@/lib/shipment-status";
import { getMessagesByOrderIds } from "@/lib/data/order-messages";

export interface AdminShipmentItem {
  id: string; // shipment_item id
  orderId: string;
  orderNumber: string;
  buyerId: string; // 依買家分組用：member id，沒有 user_id 的訂單各自獨立成一組
  customerName: string | null;
  productName: string;
  teacherName: string | null;
  productGroupName: string | null; // 只用於預購（老師/品項/細項架構）：品項名稱
  variantName: string | null; // 只用於預購：細項名稱
  quantity: number;
  price: number; // 單價
  subtotal: number; // price * quantity
  status: ShipmentItemStatus;
  shipmentId: string | null;
  shipmentMarketplaceOrderNumber: string | null; // 已合併出貨訂單的賣貨便訂單編號
  paymentStatus: PreorderPaymentStatus | null;
  payment: PaymentView | null;
  supplements: SupplementView[];
  bonusSelections: OrderBonusSelectionView[];
  pickupMethod: "shipment" | "event_pickup" | null;
  eventPickupDisplayName: string | null;
  messages: OrderMessageView[];
}

interface ShipmentItemRow {
  id: string;
  order_item_id: string;
  order_id: string;
  status: ShipmentItemStatus;
  shipment_id: string | null;
}

interface OrderItemLookupRow {
  id: string;
  product_name: string;
  teacher_name: string | null;
  product_group_name: string | null;
  variant_name: string | null;
  quantity: number;
  price: number;
  subtotal: number;
}

interface OrderLookupRow {
  id: string;
  order_number: string;
  customer_name: string | null;
  user_id: string | null;
  payment_status: PreorderPaymentStatus | null;
  pickup_method: "shipment" | "event_pickup" | null;
  event_pickup_display_name: string | null;
  total_amount: number;
}

// 後台訂單頁的合併出貨清單：以「每一件商品」為單位顯示狀態，
// 而不是整張訂單，才能支援同一張訂單內分批出貨。
export async function getShipmentItemsForAdmin(
  orderType: OrderType
): Promise<AdminShipmentItem[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const { data: shipmentItems, error } = await supabase
    .from("shipment_items")
    .select("id, order_item_id, order_id, status, shipment_id")
    .eq("order_type", orderType)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[LITAN] 讀取出貨品項失敗", error.message);
    return [];
  }

  const rows = (shipmentItems ?? []) as ShipmentItemRow[];
  if (rows.length === 0) return [];

  const orderItemIds = rows.map((r) => r.order_item_id);
  const orderIds = Array.from(new Set(rows.map((r) => r.order_id)));

  const shipmentIds = Array.from(
    new Set(rows.map((r) => r.shipment_id).filter((id): id is string => Boolean(id)))
  );

  const [
    { data: orderItems },
    { data: orders },
    { data: payments },
    { data: supplements },
    { data: shipments },
    { data: bonusSelections },
  ] = await Promise.all([
    supabase
      .from("order_items")
      .select("id, product_name, teacher_name, product_group_name, variant_name, quantity, price, subtotal")
      .in("id", orderItemIds),
    supabase
      .from("orders")
      .select(
        "id, order_number, customer_name, user_id, payment_status, pickup_method, event_pickup_display_name, total_amount"
      )
      .in("id", orderIds),
    supabase
      .from("payments")
      .select("order_id, remittance_date, remittance_time, account_last5, screenshot_url, actual_amount")
      .in("order_id", orderIds),
    supabase
      .from("supplements")
      .select("order_id, amount, reason, status, payment_method, note")
      .in("order_id", orderIds),
    shipmentIds.length > 0
      ? supabase.from("shipments").select("id, marketplace_order_number").in("id", shipmentIds)
      : Promise.resolve({ data: [] }),
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
  const paymentMap = new Map((payments ?? []).map((p) => [p.order_id, p]));
  const shipmentMarketplaceMap = new Map<string, string | null>(
    (shipments ?? []).map((s) => [s.id, s.marketplace_order_number])
  );
  const supplementsMap = new Map<string, SupplementView[]>();
  for (const s of supplements ?? []) {
    const list = supplementsMap.get(s.order_id) ?? [];
    list.push({
      amount: Number(s.amount),
      reason: s.reason,
      status: s.status,
      paymentMethod: s.payment_method,
      note: s.note,
    });
    supplementsMap.set(s.order_id, list);
  }
  const bonusSelectionsMap = new Map<string, OrderBonusSelectionView[]>();
  for (const b of bonusSelections ?? []) {
    const list = bonusSelectionsMap.get(b.order_id) ?? [];
    list.push({
      conditionProductName: b.condition_product_name,
      bonusProductName: b.bonus_product_name,
      quantity: b.quantity,
    });
    bonusSelectionsMap.set(b.order_id, list);
  }
  const messagesByOrderId = await getMessagesByOrderIds(supabase, orderIds);

  const result: AdminShipmentItem[] = [];
  for (const r of rows) {
    const oi = orderItemMap.get(r.order_item_id);
    const order = orderMap.get(r.order_id);
    if (!oi || !order) continue;
    const payment = paymentMap.get(r.order_id);
    result.push({
      id: r.id,
      orderId: r.order_id,
      orderNumber: order.order_number,
      buyerId: order.user_id ?? `order:${order.id}`,
      customerName: order.customer_name,
      productName: oi.product_name,
      teacherName: oi.teacher_name,
      productGroupName: oi.product_group_name,
      variantName: oi.variant_name,
      quantity: oi.quantity,
      price: Number(oi.price),
      subtotal: Number(oi.subtotal),
      status: r.status,
      shipmentId: r.shipment_id,
      shipmentMarketplaceOrderNumber: r.shipment_id
        ? shipmentMarketplaceMap.get(r.shipment_id) ?? null
        : null,
      paymentStatus: order.payment_status,
      payment: payment
        ? {
            remittanceDate: payment.remittance_date,
            remittanceTime: payment.remittance_time,
            accountLast5: payment.account_last5,
            screenshotUrl: payment.screenshot_url,
            actualAmount: payment.actual_amount !== null ? Number(payment.actual_amount) : null,
            underpaidAmount:
              payment.actual_amount !== null
                ? Number(order.total_amount) - Number(payment.actual_amount)
                : null,
          }
        : null,
      supplements: supplementsMap.get(r.order_id) ?? [],
      bonusSelections: bonusSelectionsMap.get(r.order_id) ?? [],
      pickupMethod: order.pickup_method,
      eventPickupDisplayName: order.event_pickup_display_name,
      messages: messagesByOrderId.get(r.order_id) ?? [],
    });
  }
  return result;
}

export async function countOrders(orderType: OrderType): Promise<number> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return 0;

  const { count } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("order_type", orderType);

  return count ?? 0;
}
