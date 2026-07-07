"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/auth";
import type { OrderType } from "@/lib/types";
import { MERGEABLE_SHIPMENT_STATUSES, SHIPMENT_STATUS_LABEL, SHIPMENT_STATUS_ORDER } from "@/lib/shipment-status";
import { getEffectiveSurcharge } from "@/lib/surcharge";

export interface ActionResult {
  success: boolean;
  message: string;
}

export interface MergeResult extends ActionResult {
  shipmentId?: string;
}

interface PickupCheckOrderRow {
  pickup_method: "shipment" | "event_pickup" | null;
  event_pickup_option_id: string | null;
}

// 一張出貨訂單只能包含同一種取貨方式：賣貨便只能合併賣貨便；活動現場取貨/面交只能合併「同一活動場次」
// 的商品（用 event_name + session_name 判斷同場次，因為不同老師各自的場次選項是分開的紀錄，
// display_name 文字不保證一致，不能拿來比對）。
async function validateSamePickupGroup(
  supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>,
  orders: PickupCheckOrderRow[]
): Promise<{ ok: true } | { ok: false; message: string }> {
  const pickupMethods = new Set(orders.map((o) => o.pickup_method ?? "shipment"));
  if (pickupMethods.size > 1) {
    return {
      ok: false,
      message: "賣貨便與活動現場取貨（面交）商品不可合併在同一張出貨訂單，請分開建立。",
    };
  }

  const method = orders[0]?.pickup_method ?? "shipment";
  if (method === "event_pickup") {
    const optionIds = Array.from(
      new Set(orders.map((o) => o.event_pickup_option_id).filter((id): id is string => Boolean(id)))
    );
    if (optionIds.length > 1) {
      const { data: options } = await supabase
        .from("event_pickup_options")
        .select("id, event_name, session_name")
        .in("id", optionIds);
      const sessionKeys = new Set(
        (options ?? []).map((o) => `${o.event_name}::${o.session_name ?? ""}`)
      );
      if (sessionKeys.size > 1) {
        return {
          ok: false,
          message: "不同活動場次的商品不可合併在同一張出貨訂單，請分開建立。",
        };
      }
    }
  }

  return { ok: true };
}

// 合併出貨規則（以「一件商品」為單位，不是整張訂單）：
// 1. 現貨不可與預購合併（只合併同一個 orderType 的品項）。
// 2. 只能合併狀態為「已到台／整理中／已開賣貨便」（見 MERGEABLE_SHIPMENT_STATUSES）
//    且尚未進入其他出貨訂單的品項——這三個狀態都代表商品已經在手上，不是還沒到貨。
// 3. 只能合併同一位買家的商品，因為一筆出貨訂單只屬於一位客戶。
// 這樣同一位買家名下已經在手上的商品（可能分散在好幾筆預購訂單裡）可以先出，
// 未到貨的商品留到下次再合併；原始預購訂單本身不會被刪除或修改，只是多建立一筆出貨訂單。
export async function mergeShipmentItems(
  itemIds: string[],
  orderType: OrderType
): Promise<MergeResult> {
  if (itemIds.length === 0) {
    return { success: false, message: "請至少選擇一件商品" };
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { data: items, error } = await supabase
    .from("shipment_items")
    .select("id, status, order_type, shipment_id, order_id, order_item_id")
    .in("id", itemIds);

  if (error || !items) {
    return { success: false, message: error?.message ?? "讀取商品狀態失敗" };
  }

  if (items.some((i) => i.order_type !== orderType)) {
    return { success: false, message: "現貨與預購商品不可合併出貨" };
  }
  if (items.some((i) => !MERGEABLE_SHIPMENT_STATUSES.includes(i.status))) {
    return { success: false, message: "只能合併已到台、整理中或已開賣貨便的商品" };
  }
  if (items.some((i) => i.shipment_id)) {
    return { success: false, message: "選取的商品已經在其他出貨訂單中" };
  }

  const orderIds = Array.from(new Set(items.map((i) => i.order_id)));
  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select("id, user_id, customer_name, pickup_method, event_pickup_option_id")
    .in("id", orderIds);

  if (ordersError || !orders) {
    return { success: false, message: ordersError?.message ?? "讀取訂單資料失敗" };
  }

  const buyerIds = new Set(orders.map((o) => o.user_id));
  if (buyerIds.size > 1) {
    return { success: false, message: "只能合併同一位買家的商品" };
  }

  // 一張出貨訂單只能是同一種取貨方式：賣貨便只能合併賣貨便，現場取貨/面交只能合併同一活動場次，
  // 避免包貨時混淆到底要走賣貨便出貨還是留給客人現場面交。
  const pickupCheck = await validateSamePickupGroup(supabase, orders);
  if (!pickupCheck.ok) {
    return { success: false, message: pickupCheck.message! };
  }

  const buyer = orders[0];

  const { data: shipment, error: shipmentError } = await supabase
    .from("shipments")
    .insert({
      shipment_type: orderType,
      status: "packing",
      user_id: buyer?.user_id ?? null,
      customer_name: buyer?.customer_name ?? null,
    })
    .select("id")
    .single();

  if (shipmentError || !shipment) {
    return { success: false, message: shipmentError?.message ?? "建立出貨訂單失敗" };
  }

  const { error: updateError } = await supabase
    .from("shipment_items")
    .update({
      shipment_id: shipment.id,
      status: "packing",
      updated_at: new Date().toISOString(),
    })
    .in("id", itemIds);

  if (updateError) {
    return { success: false, message: updateError.message };
  }

  // 二補自動帶入：品項/細項若設定了二補金額（細項優先於品項），建立出貨訂單時
  // 依商品數量加總，自動建立一筆待補款的補款紀錄（不影響後台手動新增二補的既有功能）。
  if (orderType === "preorder") {
    await autoApplyItemSurcharges(supabase, items);
  }

  revalidatePath("/admin/preorder-orders");
  revalidatePath("/admin/instock-orders");
  revalidatePath("/admin/shipments");
  revalidatePath("/member/preorder-orders");
  revalidatePath("/member/shipment-orders");

  return { success: true, message: "已建立出貨訂單", shipmentId: shipment.id };
}

interface MergedShipmentItemRow {
  order_id: string;
  order_item_id: string;
}

async function autoApplyItemSurcharges(
  supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>,
  mergedItems: MergedShipmentItemRow[]
) {
  const orderItemIds = mergedItems.map((i) => i.order_item_id);
  const { data: orderItems } = await supabase
    .from("order_items")
    .select("id, product_group_id, product_variant_id, quantity")
    .in("id", orderItemIds);

  const rows = orderItems ?? [];
  const groupIds = Array.from(
    new Set(rows.map((r) => r.product_group_id).filter((id): id is string => Boolean(id)))
  );
  const variantIds = Array.from(
    new Set(rows.map((r) => r.product_variant_id).filter((id): id is string => Boolean(id)))
  );
  if (groupIds.length === 0 && variantIds.length === 0) return;

  const [{ data: groups }, { data: variants }] = await Promise.all([
    groupIds.length > 0
      ? supabase.from("product_groups").select("id, surcharge_amount, surcharge_reason").in("id", groupIds)
      : Promise.resolve({ data: [] }),
    variantIds.length > 0
      ? supabase
          .from("product_variants")
          .select("id, surcharge_amount, surcharge_reason")
          .in("id", variantIds)
      : Promise.resolve({ data: [] }),
  ]);

  const groupMap = new Map((groups ?? []).map((g) => [g.id, g]));
  const variantMap = new Map((variants ?? []).map((v) => [v.id, v]));
  const orderItemMap = new Map(rows.map((r) => [r.id, r]));

  const surchargeByOrderId = new Map<string, { amount: number; reasons: Set<string> }>();
  for (const item of mergedItems) {
    const orderItem = orderItemMap.get(item.order_item_id);
    if (!orderItem) continue;

    const variant = orderItem.product_variant_id ? variantMap.get(orderItem.product_variant_id) : undefined;
    const group = orderItem.product_group_id ? groupMap.get(orderItem.product_group_id) : undefined;
    const { amount: effectiveAmount, reason: effectiveReason } = getEffectiveSurcharge(group, variant);
    if (effectiveAmount === null) continue;

    const entry = surchargeByOrderId.get(item.order_id) ?? { amount: 0, reasons: new Set<string>() };
    entry.amount += effectiveAmount * orderItem.quantity;
    if (effectiveReason) entry.reasons.add(effectiveReason);
    surchargeByOrderId.set(item.order_id, entry);
  }

  const insertRows = Array.from(surchargeByOrderId.entries())
    .filter(([, v]) => v.amount > 0)
    .map(([orderId, v]) => ({
      order_id: orderId,
      amount: v.amount,
      reason: Array.from(v.reasons).join("、") || "商品到貨自動帶入二補金額",
      status: "pending" as const,
      payment_method: "remittance" as const,
    }));

  if (insertRows.length > 0) {
    await supabase.from("supplements").insert(insertRows);
  }
}

export interface BatchMergeResult extends ActionResult {
  createdCount: number;
  skipped: { customerName: string | null; reason: string }[];
}

interface BatchMergeGroup {
  customerName: string | null;
  itemIds: string[];
}

// 後台「批量合併賣貨便」：一次勾選多位買家，各自獨立建立一張出貨訂單（不會把不同買家混進同一張）。
// 只合併賣貨便、匯款已確認、狀態可合併且尚未合併過的商品，其餘一律略過並回報原因，
// 讓後台知道哪些買家沒有處理、為什麼——不會為了「批量」而放寬既有的單筆合併規則。
export async function mergeShipmentItemsBatch(groups: BatchMergeGroup[]): Promise<BatchMergeResult> {
  if (groups.length === 0) {
    return { success: false, message: "請至少選擇一位買家", createdCount: 0, skipped: [] };
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return { success: false, message: "尚未設定 Supabase", createdCount: 0, skipped: [] };
  }

  const allItemIds = Array.from(new Set(groups.flatMap((g) => g.itemIds)));
  const { data: items, error } = await supabase
    .from("shipment_items")
    .select("id, status, order_type, shipment_id, order_id, order_item_id")
    .in("id", allItemIds);

  if (error || !items) {
    return { success: false, message: error?.message ?? "讀取商品狀態失敗", createdCount: 0, skipped: [] };
  }

  const orderIds = Array.from(new Set(items.map((i) => i.order_id)));
  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select("id, user_id, customer_name, pickup_method, payment_status")
    .in("id", orderIds);

  if (ordersError || !orders) {
    return { success: false, message: ordersError?.message ?? "讀取訂單資料失敗", createdCount: 0, skipped: [] };
  }

  const itemById = new Map(items.map((i) => [i.id, i]));
  const orderById = new Map(orders.map((o) => [o.id, o]));

  let createdCount = 0;
  const skipped: { customerName: string | null; reason: string }[] = [];

  for (const group of groups) {
    const reasons = new Set<string>();
    const eligibleItems: { id: string; order_id: string; order_item_id: string }[] = [];

    for (const itemId of group.itemIds) {
      const item = itemById.get(itemId);
      const order = item ? orderById.get(item.order_id) : undefined;
      if (!item || !order || item.order_type !== "preorder") continue;

      if (item.shipment_id) {
        reasons.add("商品已合併過");
        continue;
      }
      if (!MERGEABLE_SHIPMENT_STATUSES.includes(item.status)) {
        reasons.add("商品尚未到貨或未達可合併狀態");
        continue;
      }
      if ((order.pickup_method ?? "shipment") === "event_pickup") {
        reasons.add("取貨方式為面交／活動取貨，不適用批量合併賣貨便");
        continue;
      }
      if (order.payment_status !== "confirmed") {
        reasons.add("尚未確認匯款");
        continue;
      }

      eligibleItems.push({ id: item.id, order_id: item.order_id, order_item_id: item.order_item_id });
    }

    if (eligibleItems.length === 0) {
      skipped.push({
        customerName: group.customerName,
        reason: reasons.size > 0 ? Array.from(reasons).join("、") : "沒有符合條件的商品",
      });
      continue;
    }

    const buyerOrder = orderById.get(eligibleItems[0].order_id);
    const { data: shipment, error: shipmentError } = await supabase
      .from("shipments")
      .insert({
        shipment_type: "preorder",
        status: "packing",
        user_id: buyerOrder?.user_id ?? null,
        customer_name: group.customerName,
      })
      .select("id")
      .single();

    if (shipmentError || !shipment) {
      skipped.push({
        customerName: group.customerName,
        reason: shipmentError?.message ?? "建立出貨訂單失敗",
      });
      continue;
    }

    const eligibleIds = eligibleItems.map((i) => i.id);
    const { error: updateError } = await supabase
      .from("shipment_items")
      .update({ shipment_id: shipment.id, status: "packing", updated_at: new Date().toISOString() })
      .in("id", eligibleIds);

    if (updateError) {
      skipped.push({ customerName: group.customerName, reason: updateError.message });
      continue;
    }

    await autoApplyItemSurcharges(supabase, eligibleItems);
    createdCount += 1;
  }

  revalidatePath("/admin/preorder-orders");
  revalidatePath("/admin/shipments");
  revalidatePath("/member/preorder-orders");
  revalidatePath("/member/shipment-orders");

  return {
    success: true,
    message: `成功建立 ${createdCount} 張出貨訂單，略過 ${skipped.length} 位買家`,
    createdCount,
    skipped,
  };
}

// 後台點擊列印（單筆或批量）時標記「已列印」，方便辨識哪些出貨單已經印過。
// 允許重複列印（例如手誤點到、或補印遺失的單子），這裡只更新時間戳記，不做次數限制。
export async function markShipmentsPrinted(shipmentIds: string[]): Promise<ActionResult> {
  if (shipmentIds.length === 0) return { success: true, message: "" };

  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { error } = await supabase
    .from("shipments")
    .update({ printed_at: new Date().toISOString() })
    .in("id", shipmentIds);

  if (error) return { success: false, message: error.message };

  revalidatePath("/admin/shipments");
  return { success: true, message: "已標記為已列印" };
}

// 出貨批次的狀態推進：整理中 → 已開賣場 → 完成。
// 推進到「完成」時，若一張訂單的所有商品都已完成，順便把訂單狀態標記完成，
// 讓會員中心可以看到正確的最終狀態。
export async function advanceShipmentStatus(shipmentId: string): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { data: shipment } = await supabase
    .from("shipments")
    .select("status")
    .eq("id", shipmentId)
    .maybeSingle();

  if (!shipment) return { success: false, message: "找不到出貨訂單" };

  const currentIndex = SHIPMENT_STATUS_ORDER.indexOf(shipment.status);
  const nextStatus = SHIPMENT_STATUS_ORDER[currentIndex + 1];
  if (!nextStatus) return { success: false, message: "已經是最後階段" };

  await supabase.from("shipments").update({ status: nextStatus }).eq("id", shipmentId);
  await supabase
    .from("shipment_items")
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq("shipment_id", shipmentId);

  if (nextStatus === "completed") {
    const { data: items } = await supabase
      .from("shipment_items")
      .select("order_id")
      .eq("shipment_id", shipmentId);

    const orderIds = Array.from(new Set((items ?? []).map((i) => i.order_id)));
    for (const orderId of orderIds) {
      const { data: allItems } = await supabase
        .from("shipment_items")
        .select("status")
        .eq("order_id", orderId);

      if ((allItems ?? []).every((i) => i.status === "completed")) {
        await supabase.from("orders").update({ status: "completed" }).eq("id", orderId);
      }
    }
  }

  revalidatePath("/admin/shipments");
  revalidatePath("/member/preorder-orders");
  revalidatePath("/member/instock-orders");

  return { success: true, message: `已更新為「${SHIPMENT_STATUS_LABEL[nextStatus]}」` };
}

// 買家填寫出貨訂單的賣貨便訂單編號。編號綁定在出貨訂單（shipments）上，
// 不是單一商品或單一預購訂單，因為一筆出貨訂單可能包含同一買家的多筆平台訂單。
// 只有這筆出貨訂單裡至少有一筆訂單屬於目前登入會員，才能填寫，避免被亂改。
export async function setShipmentMarketplaceOrderNumber(
  shipmentId: string,
  marketplaceOrderNumber: string
): Promise<ActionResult> {
  if (!marketplaceOrderNumber.trim()) {
    return { success: false, message: "請輸入賣貨便訂單編號" };
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const member = await getCurrentMember();
  if (!member) return { success: false, message: "請先登入會員" };

  const { data: shipmentItems } = await supabase
    .from("shipment_items")
    .select("order_id")
    .eq("shipment_id", shipmentId);

  if (!shipmentItems || shipmentItems.length === 0) {
    return { success: false, message: "找不到這筆出貨訂單" };
  }

  const orderIds = Array.from(new Set(shipmentItems.map((i) => i.order_id)));
  const { data: orders } = await supabase.from("orders").select("id, user_id").in("id", orderIds);
  const belongsToMember = (orders ?? []).some((o) => o.user_id === member.id);

  if (!belongsToMember) {
    return { success: false, message: "您不是這筆出貨訂單的買家" };
  }

  const { error } = await supabase
    .from("shipments")
    .update({ marketplace_order_number: marketplaceOrderNumber.trim() })
    .eq("id", shipmentId);

  if (error) return { success: false, message: error.message };

  revalidatePath("/member/shipment-orders");
  revalidatePath("/admin/preorder-orders");
  revalidatePath("/admin/shipments");
  return { success: true, message: "已儲存賣貨便訂單編號" };
}

// 刪除出貨訂單：只有尚未完成的出貨訂單可以刪除。刪除時把裡面的商品狀態退回「已到台」、
// 解除與這筆出貨訂單的關聯，讓商品回到可重新合併的狀態；原始預購訂單與商品本身都不受影響。
export async function deleteShipmentOrder(shipmentId: string): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { data: shipment } = await supabase
    .from("shipments")
    .select("status")
    .eq("id", shipmentId)
    .maybeSingle();

  if (!shipment) return { success: false, message: "找不到這筆出貨訂單" };
  if (shipment.status === "completed") {
    return { success: false, message: "此出貨訂單已完成，無法刪除。" };
  }

  const { error: revertError } = await supabase
    .from("shipment_items")
    .update({ status: "arrived", shipment_id: null, updated_at: new Date().toISOString() })
    .eq("shipment_id", shipmentId);

  if (revertError) return { success: false, message: revertError.message };

  const { error } = await supabase.from("shipments").delete().eq("id", shipmentId);
  if (error) return { success: false, message: error.message };

  revalidatePath("/admin/preorder-orders");
  revalidatePath("/admin/instock-orders");
  revalidatePath("/admin/shipments");
  revalidatePath("/member/preorder-orders");
  revalidatePath("/member/shipment-orders");
  return { success: true, message: "已刪除出貨訂單，商品已回到可重新合併的狀態" };
}
