import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/auth";
import { getMessagesByOrderIds } from "@/lib/data/order-messages";
import { getPreorderOrderProgressIndex } from "@/lib/progress";
import type {
  ArrivalStatus,
  Order,
  OrderType,
  PreorderPaymentStatus,
  SupplementPaymentMethod,
  SupplementStatus,
} from "@/lib/types";

interface OrderItemRow {
  id: string;
  product_id: string | null;
  product_name: string;
  teacher_name: string | null;
  product_group_id: string | null;
  product_group_name: string | null;
  product_variant_id: string | null;
  variant_name: string | null;
  quantity: number;
  price: number;
  subtotal: number;
}

interface OrderRow {
  id: string;
  order_number: string;
  order_type: OrderType;
  status: string;
  total_amount: number;
  created_at: string;
  marketplace_order_number: string | null;
  payment_status: PreorderPaymentStatus | null;
  pickup_method: "shipment" | "event_pickup" | null;
  event_pickup_display_name: string | null;
  order_items: OrderItemRow[] | null;
}

interface PaymentRow {
  order_id: string;
  remittance_date: string | null;
  remittance_time: string | null;
  account_last5: string | null;
  screenshot_url: string | null;
  actual_amount: number | null;
}

interface SupplementRow {
  order_id: string;
  amount: number;
  reason: string | null;
  status: SupplementStatus;
  payment_method: SupplementPaymentMethod;
  note: string | null;
}

interface BonusSelectionRow {
  order_id: string;
  condition_product_name: string;
  bonus_product_name: string;
  quantity: number;
}

const ORDER_ITEM_COLUMNS =
  "id, product_id, product_name, teacher_name, product_group_id, product_group_name, product_variant_id, variant_name, quantity, price, subtotal";

// 依登入會員查詢「我的預購訂單」或「我的現貨訂單」，兩者查詢時皆以 order_type 篩選，
// 確保預購與現貨訂單完全分流顯示。未登入時回傳空陣列（頁面會另外提示請先登入）。
export async function getMyOrders(orderType: OrderType): Promise<Order[]> {
  const supabase = getSupabaseServerClient();
  const member = await getCurrentMember();
  if (!supabase || !member) return [];

  const { data: orders, error } = await supabase
    .from("orders")
    .select(
      `id, order_number, order_type, status, total_amount, created_at, marketplace_order_number, payment_status, pickup_method, event_pickup_display_name, order_items(${ORDER_ITEM_COLUMNS})`
    )
    .eq("user_id", member.id)
    .eq("order_type", orderType)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[LITAN] 讀取訂單失敗", error.message);
    return [];
  }

  const rows = (orders ?? []) as unknown as OrderRow[];
  if (rows.length === 0) return [];

  // 預購訂單額外帶出：每個品項目前的到貨狀態（品項層級，見 product_groups.arrival_status）、
  // 匯款資料、補款紀錄——這些只有預購才有。保底/贈品選擇（盲抽）預購和現貨都可能有，兩種訂單都要查。
  let arrivalStatusByGroupId = new Map<string, ArrivalStatus | null>();
  let paymentByOrderId = new Map<string, PaymentRow>();
  let supplementsByOrderId = new Map<string, SupplementRow[]>();
  let bonusSelectionsByOrderId = new Map<string, BonusSelectionRow[]>();

  const orderIds = rows.map((o) => o.id);
  const { data: bonusSelections } = await supabase
    .from("order_bonus_selections")
    .select("order_id, condition_product_name, bonus_product_name, quantity")
    .in("order_id", orderIds);

  bonusSelectionsByOrderId = new Map();
  for (const b of (bonusSelections ?? []) as BonusSelectionRow[]) {
    const list = bonusSelectionsByOrderId.get(b.order_id) ?? [];
    list.push(b);
    bonusSelectionsByOrderId.set(b.order_id, list);
  }

  // 商品進度／訂單進度用：這筆訂單的每件商品是否已經合併出貨（shipment_items.shipment_id），
  // 以及合併進去的出貨訂單目前狀態（賣家預購訂單進度第 3-4 階段判斷用）。
  const mergedByOrderItemId = new Map<string, boolean>();
  const shipmentStatusByOrderId = new Map<string, string[]>();

  if (orderType === "preorder") {
    const groupIds = Array.from(
      new Set(
        rows.flatMap((o) =>
          (o.order_items ?? [])
            .map((i) => i.product_group_id)
            .filter((id): id is string => Boolean(id))
        )
      )
    );
    const orderItemIds = rows.flatMap((o) => (o.order_items ?? []).map((i) => i.id));

    const [{ data: groups }, { data: payments }, { data: supplements }, { data: shipmentItems }] =
      await Promise.all([
        groupIds.length > 0
          ? supabase.from("product_groups").select("id, arrival_status").in("id", groupIds)
          : Promise.resolve({ data: [] }),
        supabase
          .from("payments")
          .select("order_id, remittance_date, remittance_time, account_last5, screenshot_url, actual_amount")
          .in("order_id", orderIds),
        supabase
          .from("supplements")
          .select("order_id, amount, reason, status, payment_method, note")
          .in("order_id", orderIds),
        orderItemIds.length > 0
          ? supabase
              .from("shipment_items")
              .select("order_id, order_item_id, shipment_id")
              .in("order_item_id", orderItemIds)
          : Promise.resolve({ data: [] }),
      ]);

    arrivalStatusByGroupId = new Map((groups ?? []).map((g) => [g.id, g.arrival_status]));
    paymentByOrderId = new Map((payments ?? []).map((p) => [p.order_id, p as PaymentRow]));
    supplementsByOrderId = new Map();
    for (const s of (supplements ?? []) as SupplementRow[]) {
      const list = supplementsByOrderId.get(s.order_id) ?? [];
      list.push(s);
      supplementsByOrderId.set(s.order_id, list);
    }

    const shipmentIds = Array.from(
      new Set((shipmentItems ?? []).map((si) => si.shipment_id).filter((id): id is string => Boolean(id)))
    );
    const { data: shipmentRows } =
      shipmentIds.length > 0
        ? await supabase.from("shipments").select("id, status").in("id", shipmentIds)
        : { data: [] };
    const shipmentStatusById = new Map((shipmentRows ?? []).map((s) => [s.id, s.status as string]));

    for (const si of shipmentItems ?? []) {
      mergedByOrderItemId.set(si.order_item_id, Boolean(si.shipment_id));
      if (si.shipment_id) {
        const list = shipmentStatusByOrderId.get(si.order_id) ?? [];
        list.push(shipmentStatusById.get(si.shipment_id) ?? "");
        shipmentStatusByOrderId.set(si.order_id, list);
      }
    }
  }

  const messagesByOrderId = await getMessagesByOrderIds(
    supabase,
    rows.map((o) => o.id)
  );

  return rows.map((o) => {
    const payment = paymentByOrderId.get(o.id);
    const orderItems = o.order_items ?? [];
    const allItemsMerged =
      orderItems.length > 0 && orderItems.every((it) => mergedByOrderItemId.get(it.id) === true);
    const shipmentStatuses = shipmentStatusByOrderId.get(o.id) ?? [];
    const mergedShipmentsListedOrBeyond =
      shipmentStatuses.length > 0 && shipmentStatuses.every((s) => s === "listed" || s === "completed");

    return {
      id: o.id,
      orderNumber: o.order_number,
      orderType: o.order_type,
      status: o.status,
      totalAmount: Number(o.total_amount),
      createdAt: o.created_at,
      items: orderItems.map((it) => ({
        productName: it.product_name,
        teacherName: it.teacher_name,
        quantity: it.quantity,
        price: Number(it.price),
        subtotal: Number(it.subtotal),
        productGroupName: it.product_group_name,
        variantName: it.variant_name,
        arrivalStatus: it.product_group_id
          ? arrivalStatusByGroupId.get(it.product_group_id) ?? null
          : null,
        merged: mergedByOrderItemId.get(it.id) ?? false,
      })),
      preorderProgressIndex:
        o.order_type === "preorder"
          ? getPreorderOrderProgressIndex({
              paymentConfirmed: o.payment_status === "confirmed",
              allItemsMerged,
              mergedShipmentsListedOrBeyond,
            })
          : undefined,
      marketplaceOrderNumber: o.marketplace_order_number,
      paymentStatus: o.payment_status,
      payment: payment
        ? {
            remittanceDate: payment.remittance_date,
            remittanceTime: payment.remittance_time,
            accountLast5: payment.account_last5,
            screenshotUrl: payment.screenshot_url,
            actualAmount: payment.actual_amount !== null ? Number(payment.actual_amount) : null,
            underpaidAmount:
              payment.actual_amount !== null ? Number(o.total_amount) - Number(payment.actual_amount) : null,
          }
        : null,
      supplements: (supplementsByOrderId.get(o.id) ?? []).map((s) => ({
        amount: Number(s.amount),
        reason: s.reason,
        status: s.status,
        paymentMethod: s.payment_method,
        note: s.note,
      })),
      bonusSelections: (bonusSelectionsByOrderId.get(o.id) ?? []).map((b) => ({
        conditionProductName: b.condition_product_name,
        bonusProductName: b.bonus_product_name,
        quantity: b.quantity,
      })),
      pickupMethod: o.pickup_method,
      eventPickupDisplayName: o.event_pickup_display_name,
      messages: messagesByOrderId.get(o.id) ?? [],
    };
  });
}
