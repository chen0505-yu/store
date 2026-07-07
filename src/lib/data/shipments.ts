import { getSupabaseServerClient } from "@/lib/supabase/server";
import type {
  OrderBonusSelectionView,
  OrderType,
  PaymentView,
  PreorderPaymentStatus,
  SupplementView,
} from "@/lib/types";
import type { ShipmentItemStatus } from "@/lib/shipment-status";
import { getEffectiveSurcharge } from "@/lib/surcharge";

export interface AdminShipmentLineItem {
  productName: string;
  productGroupName: string | null;
  variantName: string | null;
  teacherName: string | null;
  quantity: number;
  price: number;
  subtotal: number;
  status: ShipmentItemStatus;
  // 二補（依商品數量計算）：單件二補金額 × 數量 = 這件商品的二補小計。細項優先於品項設定。
  surchargeAmount: number | null;
  surchargeReason: string | null;
  surchargeSubtotal: number | null;
}

// 出貨訂單底下涉及的預購訂單，含各自的匯款/二補資料，讓後台可以直接在出貨訂單頁面設定二補，
// 不用切回預購訂單頁面（一筆出貨訂單可能合併多筆買家的預購訂單，所以是陣列）。
export interface AdminShipmentOrderInfo {
  id: string;
  orderNumber: string;
  paymentStatus: PreorderPaymentStatus | null;
  payment: PaymentView | null;
  supplements: SupplementView[];
  bonusSelections: OrderBonusSelectionView[];
}

// 一筆「出貨訂單」= 合併預購訂單後獨立建立的批次，包含買家名稱、
// 涉及的平台預購訂單編號、商品明細（含各自狀態、單價、小計）、總金額、賣貨便訂單編號。
export interface AdminShipment {
  id: string;
  shipmentNumber: string;
  shipmentType: OrderType;
  status: ShipmentItemStatus;
  customerName: string | null;
  orderNumbers: string[];
  orders: AdminShipmentOrderInfo[];
  items: AdminShipmentLineItem[];
  totalQuantity: number;
  totalAmount: number;
  marketplaceOrderNumber: string | null;
  // 取貨方式／二補狀態是聚合底下涉及的預購訂單而來：只要有一筆訂單選了現場取貨/有待二補，
  // 整筆出貨訂單就算，方便後台篩選跟提醒。
  pickupMethod: "shipment" | "event_pickup" | null;
  eventPickupDisplayName: string | null;
  supplementStatus: "pending" | "completed" | "none";
  createdAt: string;
  printedAt: string | null;
}

export async function getShipments(): Promise<AdminShipment[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const { data: shipments, error } = await supabase
    .from("shipments")
    .select(
      "id, shipment_number, shipment_type, status, customer_name, marketplace_order_number, created_at, printed_at"
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[LITAN] 讀取出貨訂單失敗", error.message);
    return [];
  }

  const rows = shipments ?? [];
  if (rows.length === 0) return [];

  const shipmentIds = rows.map((s) => s.id);
  const { data: items } = await supabase
    .from("shipment_items")
    .select("shipment_id, order_id, order_item_id, status")
    .in("shipment_id", shipmentIds);

  const itemRows = items ?? [];
  const orderItemIds = Array.from(new Set(itemRows.map((i) => i.order_item_id)));
  const orderIds = Array.from(new Set(itemRows.map((i) => i.order_id)));

  const [{ data: orderItems }, { data: orders }, { data: payments }, { data: supplements }, { data: bonusSelections }] =
    await Promise.all([
      orderItemIds.length > 0
        ? supabase
            .from("order_items")
            .select(
              "id, product_name, product_group_name, variant_name, teacher_name, quantity, price, subtotal, product_group_id, product_variant_id"
            )
            .in("id", orderItemIds)
        : Promise.resolve({ data: [] }),
      orderIds.length > 0
        ? supabase
            .from("orders")
            .select("id, order_number, payment_status, pickup_method, event_pickup_display_name, total_amount")
            .in("id", orderIds)
        : Promise.resolve({ data: [] }),
      orderIds.length > 0
        ? supabase
            .from("payments")
            .select("order_id, remittance_date, remittance_time, account_last5, screenshot_url, actual_amount")
            .in("order_id", orderIds)
        : Promise.resolve({ data: [] }),
      orderIds.length > 0
        ? supabase
            .from("supplements")
            .select("order_id, amount, reason, status, payment_method, note")
            .in("order_id", orderIds)
        : Promise.resolve({ data: [] }),
      orderIds.length > 0
        ? supabase
            .from("order_bonus_selections")
            .select("order_id, condition_product_name, bonus_product_name, quantity")
            .in("order_id", orderIds)
        : Promise.resolve({ data: [] }),
    ]);

  const orderItemRows = orderItems ?? [];
  const orderItemMap = new Map(orderItemRows.map((oi) => [oi.id, oi]));

  const surchargeGroupIds = Array.from(
    new Set(orderItemRows.map((oi) => oi.product_group_id).filter((id): id is string => Boolean(id)))
  );
  const surchargeVariantIds = Array.from(
    new Set(orderItemRows.map((oi) => oi.product_variant_id).filter((id): id is string => Boolean(id)))
  );
  const [{ data: surchargeGroups }, { data: surchargeVariants }] = await Promise.all([
    surchargeGroupIds.length > 0
      ? supabase.from("product_groups").select("id, surcharge_amount, surcharge_reason").in("id", surchargeGroupIds)
      : Promise.resolve({ data: [] }),
    surchargeVariantIds.length > 0
      ? supabase
          .from("product_variants")
          .select("id, surcharge_amount, surcharge_reason")
          .in("id", surchargeVariantIds)
      : Promise.resolve({ data: [] }),
  ]);
  const surchargeGroupMap = new Map((surchargeGroups ?? []).map((g) => [g.id, g]));
  const surchargeVariantMap = new Map((surchargeVariants ?? []).map((v) => [v.id, v]));

  const orderRows = orders ?? [];
  const orderNumberMap = new Map(orderRows.map((o) => [o.id, o.order_number as string]));
  const orderMap = new Map(orderRows.map((o) => [o.id, o]));
  const paymentByOrderId = new Map((payments ?? []).map((p) => [p.order_id, p]));
  const supplementsByOrderId = new Map<string, SupplementView[]>();
  for (const s of supplements ?? []) {
    const list = supplementsByOrderId.get(s.order_id) ?? [];
    list.push({
      amount: Number(s.amount),
      reason: s.reason,
      status: s.status,
      paymentMethod: s.payment_method,
      note: s.note,
    });
    supplementsByOrderId.set(s.order_id, list);
  }
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

  const itemsByShipment = new Map<string, typeof itemRows>();
  for (const item of itemRows) {
    if (!item.shipment_id) continue;
    const list = itemsByShipment.get(item.shipment_id) ?? [];
    list.push(item);
    itemsByShipment.set(item.shipment_id, list);
  }

  return rows.map((s) => {
    const shipmentItems = itemsByShipment.get(s.id) ?? [];
    const shipmentOrderIds = Array.from(new Set(shipmentItems.map((i) => i.order_id)));
    const orderNumbers = Array.from(
      new Set(
        shipmentItems
          .map((i) => orderNumberMap.get(i.order_id))
          .filter((n): n is string => Boolean(n))
      )
    );
    const lineItems: AdminShipmentLineItem[] = shipmentItems.map((i) => {
      const oi = orderItemMap.get(i.order_item_id);
      const group = oi?.product_group_id ? surchargeGroupMap.get(oi.product_group_id) : undefined;
      const variant = oi?.product_variant_id ? surchargeVariantMap.get(oi.product_variant_id) : undefined;
      const { amount: surchargeAmount, reason: surchargeReason } = getEffectiveSurcharge(group, variant);
      return {
        productName: oi?.product_name ?? "-",
        productGroupName: oi?.product_group_name ?? null,
        variantName: oi?.variant_name ?? null,
        teacherName: oi?.teacher_name ?? null,
        quantity: oi?.quantity ?? 0,
        price: Number(oi?.price ?? 0),
        subtotal: Number(oi?.subtotal ?? 0),
        status: i.status,
        surchargeAmount,
        surchargeReason,
        surchargeSubtotal: surchargeAmount !== null ? surchargeAmount * (oi?.quantity ?? 0) : null,
      };
    });

    const shipmentOrders: AdminShipmentOrderInfo[] = shipmentOrderIds
      .map((orderId) => {
        const order = orderMap.get(orderId);
        if (!order) return null;
        const payment = paymentByOrderId.get(orderId);
        return {
          id: orderId,
          orderNumber: order.order_number as string,
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
          supplements: supplementsByOrderId.get(orderId) ?? [],
          bonusSelections: bonusSelectionsByOrderId.get(orderId) ?? [],
        };
      })
      .filter((o): o is AdminShipmentOrderInfo => Boolean(o));

    const eventPickupOrder = shipmentOrderIds
      .map((id) => orderMap.get(id))
      .find((o) => o?.pickup_method === "event_pickup");
    const pickupMethod = eventPickupOrder ? "event_pickup" : shipmentOrderIds.length > 0 ? "shipment" : null;

    const allSupplements = shipmentOrders.flatMap((o) => o.supplements);
    const supplementStatus: "pending" | "completed" | "none" = allSupplements.some(
      (sp) => sp.status === "pending"
    )
      ? "pending"
      : allSupplements.some((sp) => sp.status === "completed")
        ? "completed"
        : "none";

    return {
      id: s.id,
      shipmentNumber: s.shipment_number,
      shipmentType: s.shipment_type,
      status: s.status,
      customerName: s.customer_name,
      orderNumbers,
      orders: shipmentOrders,
      items: lineItems,
      totalQuantity: lineItems.reduce((sum, i) => sum + i.quantity, 0),
      totalAmount: lineItems.reduce((sum, i) => sum + i.subtotal, 0),
      marketplaceOrderNumber: s.marketplace_order_number,
      pickupMethod,
      eventPickupDisplayName: eventPickupOrder?.event_pickup_display_name ?? null,
      supplementStatus,
      createdAt: s.created_at,
      printedAt: s.printed_at,
    };
  });
}
