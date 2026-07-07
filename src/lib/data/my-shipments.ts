import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/auth";
import type { OrderBonusSelectionView } from "@/lib/types";
import type { ShipmentItemStatus } from "@/lib/shipment-status";
import { getEffectiveSurcharge } from "@/lib/surcharge";

export interface MyShipmentOrderItem {
  productName: string;
  teacherName: string | null;
  quantity: number;
  status: ShipmentItemStatus;
  // 二補（依商品數量計算）：單件二補金額 × 數量 = 這件商品的二補小計。細項優先於品項設定。
  surchargeAmount: number | null;
  surchargeReason: string | null;
  surchargeSubtotal: number | null;
}

// 二補：到貨後需要客戶補差額，只顯示金額/原因/狀態，客戶只能看不能改。
export interface MyShipmentSupplement {
  amount: number;
  reason: string | null;
  status: "pending" | "completed" | "not_needed" | "cancelled";
}

// 買家端的「出貨訂單」：後台把買家已到台的預購商品合併出貨後，另外建立的一筆獨立紀錄，
// 原始預購訂單不受影響。買家在「我的出貨訂單」可以看到這筆出貨訂單本身的狀態與明細，
// 並在這裡（而不是原始預購訂單上）填寫賣貨便訂單編號，避免多筆訂單合併後資料混亂。
export interface MyShipmentOrder {
  id: string; // shipment id
  shipmentNumber: string;
  status: ShipmentItemStatus;
  orderNumbers: string[];
  marketplaceOrderNumber: string | null;
  items: MyShipmentOrderItem[];
  pickupMethod: "shipment" | "event_pickup" | null;
  eventPickupDisplayName: string | null;
  supplements: MyShipmentSupplement[];
  bonusSelections: OrderBonusSelectionView[];
  createdAt: string;
}

export async function getMyShipmentBatches(): Promise<MyShipmentOrder[]> {
  const supabase = getSupabaseServerClient();
  const member = await getCurrentMember();
  if (!supabase || !member) return [];

  const { data: orders } = await supabase
    .from("orders")
    .select("id, order_number, pickup_method, event_pickup_display_name")
    .eq("user_id", member.id)
    .eq("order_type", "preorder");

  if (!orders || orders.length === 0) return [];

  const orderIds = orders.map((o) => o.id);
  const orderById = new Map(orders.map((o) => [o.id, o]));

  const { data: shipmentItems } = await supabase
    .from("shipment_items")
    .select("shipment_id, order_id, order_item_id, status")
    .in("order_id", orderIds)
    .not("shipment_id", "is", null);

  if (!shipmentItems || shipmentItems.length === 0) return [];

  const orderItemIds = Array.from(new Set(shipmentItems.map((i) => i.order_item_id)));
  const shipmentIds = Array.from(
    new Set(shipmentItems.map((i) => i.shipment_id).filter((id): id is string => Boolean(id)))
  );

  const [{ data: orderItems }, { data: shipments }, { data: supplements }, { data: bonusSelections }] =
    await Promise.all([
      supabase
        .from("order_items")
        .select("id, product_name, teacher_name, quantity, product_group_id, product_variant_id")
        .in("id", orderItemIds),
      supabase
        .from("shipments")
        .select("id, shipment_number, status, marketplace_order_number, created_at")
        .in("id", shipmentIds)
        .order("created_at", { ascending: false }),
      supabase.from("supplements").select("order_id, amount, reason, status").in("order_id", orderIds),
      supabase
        .from("order_bonus_selections")
        .select("order_id, condition_product_name, bonus_product_name, quantity")
        .in("order_id", orderIds),
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
  const shipmentMap = new Map((shipments ?? []).map((s) => [s.id, s]));
  const supplementsByOrderId = new Map<string, MyShipmentSupplement[]>();
  for (const s of supplements ?? []) {
    const list = supplementsByOrderId.get(s.order_id) ?? [];
    list.push({ amount: Number(s.amount), reason: s.reason, status: s.status });
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

  const batches = new Map<string, MyShipmentOrder>();
  for (const item of shipmentItems) {
    if (!item.shipment_id) continue;
    const shipment = shipmentMap.get(item.shipment_id);
    const orderItem = orderItemMap.get(item.order_item_id);
    if (!shipment || !orderItem) continue;

    let batch = batches.get(item.shipment_id);
    if (!batch) {
      batch = {
        id: item.shipment_id,
        shipmentNumber: shipment.shipment_number,
        status: shipment.status,
        orderNumbers: [],
        marketplaceOrderNumber: shipment.marketplace_order_number,
        items: [],
        pickupMethod: null,
        eventPickupDisplayName: null,
        supplements: [],
        bonusSelections: [],
        createdAt: shipment.created_at,
      };
      batches.set(item.shipment_id, batch);
    }

    const order = orderById.get(item.order_id);
    if (order && !batch.orderNumbers.includes(order.order_number as string)) {
      batch.orderNumbers.push(order.order_number as string);
    }
    // 聚合取貨方式：只要合併進來的任一筆訂單是現場取貨，整筆出貨訂單就算現場取貨。
    if (order?.pickup_method === "event_pickup") {
      batch.pickupMethod = "event_pickup";
      batch.eventPickupDisplayName = order.event_pickup_display_name;
    } else if (batch.pickupMethod !== "event_pickup") {
      batch.pickupMethod = "shipment";
    }
    for (const sp of supplementsByOrderId.get(item.order_id) ?? []) {
      if (!batch.supplements.some((existing) => existing === sp)) {
        batch.supplements.push(sp);
      }
    }
    for (const b of bonusSelectionsByOrderId.get(item.order_id) ?? []) {
      if (!batch.bonusSelections.some((existing) => existing === b)) {
        batch.bonusSelections.push(b);
      }
    }

    const group = orderItem.product_group_id ? surchargeGroupMap.get(orderItem.product_group_id) : undefined;
    const variant = orderItem.product_variant_id
      ? surchargeVariantMap.get(orderItem.product_variant_id)
      : undefined;
    const { amount: surchargeAmount, reason: surchargeReason } = getEffectiveSurcharge(group, variant);

    batch.items.push({
      productName: orderItem.product_name,
      teacherName: orderItem.teacher_name,
      quantity: orderItem.quantity,
      status: item.status,
      surchargeAmount,
      surchargeReason,
      surchargeSubtotal: surchargeAmount !== null ? surchargeAmount * orderItem.quantity : null,
    });
  }

  return Array.from(batches.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
