"use server";

import { revalidatePath } from "next/cache";
import { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/auth";
import type { ArrivalStatus, PreorderPaymentStatus } from "@/lib/types";
import type { PreorderCartItem } from "@/lib/cart/use-preorder-cart";
import type { InstockCartItem } from "@/lib/cart/use-instock-cart";
import { getInstockPhase, getPreorderPhase } from "@/lib/product-availability";
import { mapArrivalStatusToShipmentStatus } from "@/lib/shipment-status";

export interface CreateOrderResult {
  success: boolean;
  message: string;
  orderNumber?: string;
}

export interface ActionResult {
  success: boolean;
  message: string;
}

const BLACKLIST_MESSAGE = "您的帳號目前無法下單，請聯繫管理員。";

// 後台設定預購訂單的匯款/付款狀態，只有「已確認」的訂單才會被列入
// 「預購商品品項總數」統計（見 lib/data/preorder-stats.ts）。
export async function setOrderPaymentStatus(
  orderId: string,
  status: PreorderPaymentStatus
): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { error } = await supabase
    .from("orders")
    .update({ payment_status: status })
    .eq("id", orderId)
    .eq("order_type", "preorder");

  if (error) return { success: false, message: error.message };

  revalidatePath("/admin/preorder-orders");
  revalidatePath("/admin/product-stats");
  return { success: true, message: "已更新付款狀態" };
}

const PREORDER_ORDER_NOT_FINISHED_MESSAGE = "此訂單尚未完成，無法刪除。";

// 預購訂單可以永久刪除的條件（符合其中一項即可）：
// 1. 未付款，且尚未建立任何出貨訂單（所有品項都還沒被合併）。
// 2. 訂單內所有品項都已經完成出貨（shipment_items.status 全部是 completed）。
// 其餘情況（已付款但未出貨、商品尚未到台/整理中/已開賣貨便、出貨訂單尚未完成）一律不可刪除。
export async function deletePreorderOrder(orderId: string): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { data: order } = await supabase
    .from("orders")
    .select("id, payment_status")
    .eq("id", orderId)
    .eq("order_type", "preorder")
    .maybeSingle();

  if (!order) return { success: false, message: "找不到這筆訂單" };

  const { data: shipmentItems } = await supabase
    .from("shipment_items")
    .select("status, shipment_id")
    .eq("order_id", orderId);

  const items = shipmentItems ?? [];
  const notRemittedAndUnmerged =
    order.payment_status === "not_remitted" && items.every((i) => !i.shipment_id);
  const allShippedCompleted = items.length > 0 && items.every((i) => i.status === "completed");

  if (!notRemittedAndUnmerged && !allShippedCompleted) {
    return { success: false, message: PREORDER_ORDER_NOT_FINISHED_MESSAGE };
  }

  const { error } = await supabase.from("orders").delete().eq("id", orderId);
  if (error) return { success: false, message: error.message };

  revalidatePath("/admin/preorder-orders");
  revalidatePath("/admin/shipments");
  revalidatePath("/admin/product-stats");
  revalidatePath("/member/preorder-orders");
  revalidatePath("/member/shipment-orders");
  return { success: true, message: "已永久刪除訂單" };
}

async function generateOrderNumber(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc("next_order_number");
  if (error || !data) {
    throw new Error(error?.message ?? "訂單編號產生失敗");
  }
  return data as string;
}

interface GroupSnapshot {
  teacherId: string;
  teacherCode: string | null;
  teacherName: string;
  arrivalStatus: ArrivalStatus;
  isArchived: boolean;
}

// 商品架構為 老師 → 品項（product_groups） → 細項（product_variants）。
// 下單當下把品項目前所屬老師的代碼、到貨狀態快照下來，決定 shipment_items 初始狀態，
// 並在建立訂單前重新驗證一次（避免前端顯示過舊被繞過）。
async function getGroupSnapshots(
  supabase: SupabaseClient,
  groupIds: string[]
): Promise<Map<string, GroupSnapshot>> {
  const { data: groups } = await supabase
    .from("product_groups")
    .select("id, teacher_id, arrival_status, is_archived")
    .in("id", groupIds);

  const teacherIds = Array.from(new Set((groups ?? []).map((g) => g.teacher_id)));
  const { data: teachers } =
    teacherIds.length > 0
      ? await supabase.from("teachers").select("id, teacher_code, name").in("id", teacherIds)
      : { data: [] };

  const teacherMap = new Map((teachers ?? []).map((t) => [t.id, t]));

  const map = new Map<string, GroupSnapshot>();
  for (const g of groups ?? []) {
    const teacher = teacherMap.get(g.teacher_id);
    map.set(g.id, {
      teacherId: g.teacher_id,
      teacherCode: teacher?.teacher_code ?? null,
      teacherName: teacher?.name ?? "",
      arrivalStatus: g.arrival_status,
      isArchived: g.is_archived,
    });
  }
  return map;
}

// 每一件預購 order_item 都對應一個 shipment_item，用來獨立追蹤到貨／出貨狀態，
// 到貨追蹤以「品項」為單位（見 product_groups.arrival_status），
// 讓同一張訂單裡的商品可以依品項到貨進度分批出貨，而不是整張訂單一起卡住。
async function createPreorderShipmentItemsForGroups(
  supabase: SupabaseClient,
  orderId: string,
  createdOrderItems: { id: string; product_group_id: string | null }[],
  snapshots: Map<string, GroupSnapshot>
) {
  const rows = createdOrderItems.map((oi) => {
    const snapshot = oi.product_group_id ? snapshots.get(oi.product_group_id) : undefined;
    const status = snapshot ? mapArrivalStatusToShipmentStatus(snapshot.arrivalStatus) : "not_arrived";
    return {
      order_item_id: oi.id,
      order_id: orderId,
      order_type: "preorder" as const,
      status,
    };
  });

  const { error } = await supabase.from("shipment_items").insert(rows);
  if (error) {
    throw new Error(error.message);
  }
}

export interface BonusSelectionInput {
  groupId: string;
  variantId: string;
}

export interface PickupInput {
  method: "shipment" | "event_pickup";
  eventPickupOptionId?: string;
}

export async function createPreorderOrder(
  items: PreorderCartItem[],
  customerName: string,
  bonusSelections: BonusSelectionInput[] = [],
  pickupInput: PickupInput = { method: "shipment" }
): Promise<CreateOrderResult> {
  if (items.length === 0) {
    return { success: false, message: "購物車是空的" };
  }
  if (!customerName.trim()) {
    return { success: false, message: "請輸入客戶名稱" };
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return { success: false, message: "尚未設定 Supabase，請先建立 .env.local" };
  }

  const member = await getCurrentMember();
  if (!member) {
    return { success: false, message: "請先登入會員才能下單" };
  }
  if (member.isBlacklisted) {
    return { success: false, message: BLACKLIST_MESSAGE };
  }

  // 下單前重新驗證細項是否還啟用、品項是否還沒被封存，避免前端顯示過舊被繞過。
  const variantIds = items.map((i) => i.variantId);
  const { data: variantRows } = await supabase
    .from("product_variants")
    .select("id, is_active")
    .in("id", variantIds);
  const variantMap = new Map((variantRows ?? []).map((v) => [v.id, v]));

  const groupIds = Array.from(new Set(items.map((i) => i.productGroupId)));
  const groupSnapshots = await getGroupSnapshots(supabase, groupIds);

  // 預購時間窗設在老師賣場層級，整間賣場共用一個預購期間。
  const teacherIds = Array.from(new Set(items.map((i) => i.teacherId)));
  const { data: teacherRows } = await supabase
    .from("teachers")
    .select("id, preorder_starts_at, preorder_ends_at")
    .in("id", teacherIds);
  const teacherWindowMap = new Map((teacherRows ?? []).map((t) => [t.id, t]));

  for (const item of items) {
    const variant = variantMap.get(item.variantId);
    if (!variant || !variant.is_active) {
      return { success: false, message: `「${item.variantName}」已下架，請調整購物車後再試一次` };
    }
    const group = groupSnapshots.get(item.productGroupId);
    if (!group || group.isArchived) {
      return { success: false, message: `「${item.productGroupName}」已下架，請調整購物車後再試一次` };
    }
    const teacherWindow = teacherWindowMap.get(item.teacherId);
    const phase = getPreorderPhase({
      preorderStartsAt: teacherWindow?.preorder_starts_at ?? null,
      preorderEndsAt: teacherWindow?.preorder_ends_at ?? null,
    });
    if (phase === "not_started") {
      return { success: false, message: `「${item.teacherName}」預購尚未開始` };
    }
    if (phase === "ended") {
      return { success: false, message: `「${item.teacherName}」預購已結束` };
    }
  }

  // 盲抽/滿抽保底選擇：下單前重新查詢一次即時的盲抽設定並驗證，避免前端資料過舊被繞過
  // （選超過可選數量、選到非保底細項、或品項根本沒開盲抽）。
  const bonusGroupIds = Array.from(new Set(bonusSelections.map((b) => b.groupId)));
  const bonusInsertRows: { condition_product_name: string; bonus_product_name: string; quantity: number }[] = [];

  if (bonusGroupIds.length > 0) {
    const [{ data: blindDrawGroups }, { data: bonusVariants }] = await Promise.all([
      supabase
        .from("product_groups")
        .select("id, name, is_blind_draw, blind_draw_threshold_qty, blind_draw_pick_qty")
        .in("id", bonusGroupIds),
      supabase
        .from("product_variants")
        .select("id, product_group_id, name, is_bonus_option, is_active")
        .in("id", bonusSelections.map((b) => b.variantId)),
    ]);

    const blindDrawGroupMap = new Map((blindDrawGroups ?? []).map((g) => [g.id, g]));
    const bonusVariantMap = new Map((bonusVariants ?? []).map((v) => [v.id, v]));

    const selectionsByGroup = new Map<string, string[]>();
    for (const b of bonusSelections) {
      const list = selectionsByGroup.get(b.groupId) ?? [];
      list.push(b.variantId);
      selectionsByGroup.set(b.groupId, list);
    }

    for (const [groupId, variantIds] of selectionsByGroup) {
      const group = blindDrawGroupMap.get(groupId);
      if (!group || !group.is_blind_draw || !group.blind_draw_threshold_qty || !group.blind_draw_pick_qty) {
        return { success: false, message: "保底選擇的品項未開放盲抽，請重新整理購物車" };
      }
      const purchasedQty = items
        .filter((i) => i.productGroupId === groupId)
        .reduce((sum, i) => sum + i.quantity, 0);
      const allowed =
        Math.floor(purchasedQty / group.blind_draw_threshold_qty) * group.blind_draw_pick_qty;
      if (variantIds.length > allowed) {
        return { success: false, message: `「${group.name}」保底選擇超過可選數量，請重新整理購物車` };
      }
      for (const variantId of variantIds) {
        const variant = bonusVariantMap.get(variantId);
        if (!variant || variant.product_group_id !== groupId || !variant.is_bonus_option || !variant.is_active) {
          return { success: false, message: "保底選擇的細項無效，請重新整理購物車" };
        }
      }
    }

    // 同一個細項選多次時合併成一筆並記錄數量。
    const aggregated = new Map<string, { groupName: string; variantName: string; quantity: number }>();
    for (const b of bonusSelections) {
      const group = blindDrawGroupMap.get(b.groupId)!;
      const variant = bonusVariantMap.get(b.variantId)!;
      const key = `${b.groupId}::${b.variantId}`;
      const existing = aggregated.get(key);
      if (existing) existing.quantity += 1;
      else aggregated.set(key, { groupName: group.name, variantName: variant.name, quantity: 1 });
    }
    for (const a of aggregated.values()) {
      bonusInsertRows.push({
        condition_product_name: a.groupName,
        bonus_product_name: a.variantName,
        quantity: a.quantity,
      });
    }
  }

  // 活動現場取貨：下單前重新驗證選項是否還存在、啟用中，且屬於購物車裡某個有開放現場取貨的老師，
  // 避免前端資料過舊被繞過。預設一律是「賣貨便配送」（沿用既有出貨流程）。
  //
  // 活動現場取貨商品與賣貨便商品不可混在同一張訂單：
  // 1. 購物車裡的老師若有不開放現場取貨的，整張訂單就不能選現場取貨。
  // 2. 選定的場次必須是「同一活動場次」——購物車裡每個老師都要有相同 event_name/session_name
  //    的啟用中場次，避免不同老師的商品被誤湊成同一次現場取貨。
  let eventPickupDisplayName: string | null = null;
  let eventPickupOptionId: string | null = null;
  if (pickupInput.method === "event_pickup") {
    if (!pickupInput.eventPickupOptionId) {
      return { success: false, message: "請選擇活動現場取貨場次" };
    }
    const { data: option } = await supabase
      .from("event_pickup_options")
      .select("id, teacher_id, event_name, session_name, display_name, is_active")
      .eq("id", pickupInput.eventPickupOptionId)
      .maybeSingle();
    if (!option || !option.is_active || !teacherIds.includes(option.teacher_id)) {
      return { success: false, message: "取貨選項無效，請重新整理購物車" };
    }

    const { data: cartTeachers } = await supabase
      .from("teachers")
      .select("id, name, allow_event_pickup")
      .in("id", teacherIds);
    const cartTeacherMap = new Map((cartTeachers ?? []).map((t) => [t.id, t]));

    if (teacherIds.some((id) => !cartTeacherMap.get(id)?.allow_event_pickup)) {
      return {
        success: false,
        message: "賣貨便與活動現場取貨商品需分開結帳，請分開送出訂單。",
      };
    }

    const otherTeacherIds = teacherIds.filter((id) => id !== option.teacher_id);
    if (otherTeacherIds.length > 0) {
      let sessionQuery = supabase
        .from("event_pickup_options")
        .select("teacher_id")
        .in("teacher_id", otherTeacherIds)
        .eq("event_name", option.event_name)
        .eq("is_active", true);
      sessionQuery =
        option.session_name === null
          ? sessionQuery.is("session_name", null)
          : sessionQuery.eq("session_name", option.session_name);
      const { data: matchingOptions } = await sessionQuery;
      const matchedTeacherIds = new Set((matchingOptions ?? []).map((o) => o.teacher_id));
      const missingTeacherId = otherTeacherIds.find((id) => !matchedTeacherIds.has(id));
      if (missingTeacherId) {
        const teacherName = cartTeacherMap.get(missingTeacherId)?.name ?? "此老師";
        return {
          success: false,
          message: `「${teacherName}」未開放此場次的現場取貨，請重新選擇場次或分開送出訂單。`,
        };
      }
    }

    eventPickupOptionId = option.id;
    eventPickupDisplayName = option.display_name;
  }

  const orderNumber = await generateOrderNumber(supabase);
  const totalAmount = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

  // 預購沒有庫存，下單不需扣庫存，僅建立訂單與訂單明細，等待客戶匯款。
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      order_number: orderNumber,
      user_id: member.id,
      order_type: "preorder",
      status: "pending_payment",
      payment_status: "not_remitted",
      total_amount: totalAmount,
      customer_name: customerName.trim(),
      pickup_method: pickupInput.method,
      event_pickup_option_id: eventPickupOptionId,
      event_pickup_display_name: eventPickupDisplayName,
    })
    .select("id")
    .single();

  if (orderError || !order) {
    return { success: false, message: orderError?.message ?? "建立訂單失敗" };
  }

  const { data: createdItems, error: itemsError } = await supabase
    .from("order_items")
    .insert(
      items.map((item) => {
        const group = groupSnapshots.get(item.productGroupId);
        return {
          order_id: order.id,
          product_id: null,
          product_name: `${item.productGroupName} - ${item.variantName}`,
          teacher_name: item.teacherName,
          teacher_code: group?.teacherCode ?? null,
          product_group_id: item.productGroupId,
          product_group_name: item.productGroupName,
          product_variant_id: item.variantId,
          variant_name: item.variantName,
          quantity: item.quantity,
          price: item.unitPrice,
        };
      })
    )
    .select("id, product_group_id");

  if (itemsError || !createdItems) {
    return { success: false, message: itemsError?.message ?? "建立訂單明細失敗" };
  }

  await createPreorderShipmentItemsForGroups(supabase, order.id, createdItems, groupSnapshots);

  if (bonusInsertRows.length > 0) {
    await supabase.from("order_bonus_selections").insert(
      bonusInsertRows.map((r) => ({
        order_id: order.id,
        condition_product_name: r.condition_product_name,
        bonus_product_name: r.bonus_product_name,
        quantity: r.quantity,
      }))
    );
  }

  revalidatePath("/member/preorder-orders");
  return {
    success: true,
    message: "預購訂單已建立，請完成匯款",
    orderNumber,
  };
}

// 商品架構為 老師 → 品項（instock_product_groups） → 細項（instock_product_variants），
// 庫存記在細項上，下單需要重新檢查庫存/封存/停用狀態並扣庫存，跟預購（沒有庫存）不同。
export async function createInstockOrder(
  items: InstockCartItem[],
  customerName: string,
  bonusSelections: BonusSelectionInput[] = []
): Promise<CreateOrderResult> {
  if (items.length === 0) {
    return { success: false, message: "購物車是空的" };
  }
  if (!customerName.trim()) {
    return { success: false, message: "請輸入客戶名稱" };
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return { success: false, message: "尚未設定 Supabase，請先建立 .env.local" };
  }

  const member = await getCurrentMember();
  if (!member) {
    return { success: false, message: "請先登入會員才能下單" };
  }
  if (member.isBlacklisted) {
    return { success: false, message: BLACKLIST_MESSAGE };
  }

  // 現貨區有開關與期間限定，下單前重新檢查一次，避免前端狀態過舊被繞過。
  const { data: settingsRow } = await supabase
    .from("instock_settings")
    .select("is_open, starts_at, ends_at")
    .limit(1)
    .maybeSingle();

  const phase = getInstockPhase(
    settingsRow
      ? { isOpen: settingsRow.is_open, startsAt: settingsRow.starts_at, endsAt: settingsRow.ends_at }
      : null
  );

  if (phase !== "open") {
    const message =
      phase === "closed"
        ? "現貨區整理中，尚未開放"
        : phase === "not_started"
          ? "現貨尚未開始"
          : "期間限定已結束，無法下單";
    return { success: false, message };
  }

  // 下單前重新檢查庫存、細項是否停用、品項是否封存，避免因購物車暫存資料過舊而超賣或買到已下架商品。
  const variantIds = items.map((i) => i.variantId);
  const { data: variantRows, error: variantError } = await supabase
    .from("instock_product_variants")
    .select("id, instock_product_group_id, name, stock_quantity, is_sold_out, is_active")
    .in("id", variantIds);

  if (variantError || !variantRows) {
    return { success: false, message: variantError?.message ?? "商品資料讀取失敗" };
  }

  const groupIds = Array.from(new Set(variantRows.map((v) => v.instock_product_group_id)));
  const { data: groupRows } = await supabase
    .from("instock_product_groups")
    .select("id, teacher_id, is_archived")
    .in("id", groupIds);
  const groupMap = new Map((groupRows ?? []).map((g) => [g.id, g]));

  const teacherIds = Array.from(new Set((groupRows ?? []).map((g) => g.teacher_id)));
  const { data: teacherRows } =
    teacherIds.length > 0
      ? await supabase.from("teachers").select("id, teacher_code").in("id", teacherIds)
      : { data: [] };
  const teacherCodeById = new Map((teacherRows ?? []).map((t) => [t.id, t.teacher_code as string]));

  for (const item of items) {
    const variant = variantRows.find((v) => v.id === item.variantId);
    if (!variant || !variant.is_active) {
      return { success: false, message: `「${item.variantName}」已下架，請調整購物車後再試一次` };
    }
    const group = groupMap.get(variant.instock_product_group_id);
    if (!group || group.is_archived) {
      return { success: false, message: `「${item.groupName}」已下架，請調整購物車後再試一次` };
    }
    if (variant.is_sold_out || variant.stock_quantity < item.quantity) {
      return { success: false, message: `「${item.variantName}」庫存不足，請調整購物車後再試一次` };
    }
  }

  // 盲抽/滿抽保底選擇：下單前重新查詢一次即時的盲抽設定並驗證，避免前端資料過舊被繞過
  // （選超過可選數量、選到非保底細項、或品項根本沒開盲抽）。保底細項現貨也要管理庫存，
  // 所以額外檢查庫存並在扣庫存迴圈一併扣除。
  const bonusGroupIds = Array.from(new Set(bonusSelections.map((b) => b.groupId)));
  const bonusInsertRows: { condition_product_name: string; bonus_product_name: string; quantity: number }[] = [];
  const bonusStockDeductions = new Map<string, number>();

  if (bonusGroupIds.length > 0) {
    const [{ data: blindDrawGroups }, { data: bonusVariants }] = await Promise.all([
      supabase
        .from("instock_product_groups")
        .select("id, name, is_blind_draw, blind_draw_threshold_qty, blind_draw_pick_qty")
        .in("id", bonusGroupIds),
      supabase
        .from("instock_product_variants")
        .select("id, instock_product_group_id, name, is_bonus_option, is_active, stock_quantity, is_sold_out")
        .in("id", bonusSelections.map((b) => b.variantId)),
    ]);

    const blindDrawGroupMap = new Map((blindDrawGroups ?? []).map((g) => [g.id, g]));
    const bonusVariantMap = new Map((bonusVariants ?? []).map((v) => [v.id, v]));

    const selectionsByGroup = new Map<string, string[]>();
    for (const b of bonusSelections) {
      const list = selectionsByGroup.get(b.groupId) ?? [];
      list.push(b.variantId);
      selectionsByGroup.set(b.groupId, list);
    }

    for (const [groupId, selVariantIds] of selectionsByGroup) {
      const group = blindDrawGroupMap.get(groupId);
      if (!group || !group.is_blind_draw || !group.blind_draw_threshold_qty || !group.blind_draw_pick_qty) {
        return { success: false, message: "保底選擇的品項未開放盲抽，請重新整理購物車" };
      }
      const purchasedQty = items
        .filter((i) => i.groupId === groupId)
        .reduce((sum, i) => sum + i.quantity, 0);
      const allowed =
        Math.floor(purchasedQty / group.blind_draw_threshold_qty) * group.blind_draw_pick_qty;
      if (selVariantIds.length > allowed) {
        return { success: false, message: `「${group.name}」保底選擇超過可選數量，請重新整理購物車` };
      }
      for (const variantId of selVariantIds) {
        const variant = bonusVariantMap.get(variantId);
        if (!variant || variant.instock_product_group_id !== groupId || !variant.is_bonus_option || !variant.is_active) {
          return { success: false, message: "保底選擇的細項無效，請重新整理購物車" };
        }
      }
    }

    // 同一個細項選多次時合併成一筆並記錄數量，也用同一份加總結果檢查/扣庫存。
    const aggregated = new Map<string, { groupName: string; variantName: string; quantity: number }>();
    for (const b of bonusSelections) {
      const group = blindDrawGroupMap.get(b.groupId)!;
      const variant = bonusVariantMap.get(b.variantId)!;
      const key = `${b.groupId}::${b.variantId}`;
      const existing = aggregated.get(key);
      if (existing) existing.quantity += 1;
      else aggregated.set(key, { groupName: group.name, variantName: variant.name, quantity: 1 });
    }
    for (const [key, a] of aggregated) {
      const variantId = key.split("::")[1];
      const variant = bonusVariantMap.get(variantId)!;
      if (variant.is_sold_out || variant.stock_quantity < a.quantity) {
        return { success: false, message: `保底「${a.variantName}」庫存不足，請重新整理購物車` };
      }
      bonusInsertRows.push({
        condition_product_name: a.groupName,
        bonus_product_name: a.variantName,
        quantity: a.quantity,
      });
      bonusStockDeductions.set(variantId, (bonusStockDeductions.get(variantId) ?? 0) + a.quantity);
    }
  }

  const orderNumber = await generateOrderNumber(supabase);
  const totalAmount = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      order_number: orderNumber,
      user_id: member.id,
      order_type: "instock",
      status: "pending_shipment",
      total_amount: totalAmount,
      customer_name: customerName.trim(),
    })
    .select("id")
    .single();

  if (orderError || !order) {
    return { success: false, message: orderError?.message ?? "建立訂單失敗" };
  }

  const { error: itemsError } = await supabase.from("order_items").insert(
    items.map((item) => {
      const variant = variantRows.find((v) => v.id === item.variantId)!;
      const group = groupMap.get(variant.instock_product_group_id);
      return {
        order_id: order.id,
        product_name: `${item.groupName} - ${item.variantName}`,
        teacher_name: item.teacherName,
        teacher_code: group ? teacherCodeById.get(group.teacher_id) ?? null : null,
        instock_group_id: item.groupId,
        product_group_name: item.groupName,
        instock_variant_id: item.variantId,
        variant_name: item.variantName,
        quantity: item.quantity,
        price: item.unitPrice,
      };
    })
  );

  if (itemsError) {
    return { success: false, message: itemsError.message };
  }

  // 現貨改為買家自行完成賣貨便並回填訂單編號，不再建立 shipment_items。

  if (bonusInsertRows.length > 0) {
    await supabase.from("order_bonus_selections").insert(
      bonusInsertRows.map((r) => ({
        order_id: order.id,
        condition_product_name: r.condition_product_name,
        bonus_product_name: r.bonus_product_name,
        quantity: r.quantity,
      }))
    );
  }

  // 現貨下單自動扣庫存，庫存歸零時標記已售完，並寫入 stock_logs。保底選擇的細項也要一併扣庫存。
  for (const item of items) {
    const variant = variantRows.find((v) => v.id === item.variantId)!;
    const newQuantity = variant.stock_quantity - item.quantity;

    await supabase
      .from("instock_product_variants")
      .update({
        stock_quantity: newQuantity,
        is_sold_out: newQuantity <= 0,
      })
      .eq("id", item.variantId);

    await supabase.from("stock_logs").insert({
      instock_variant_id: item.variantId,
      change_qty: -item.quantity,
      reason: `訂單 ${orderNumber} 扣庫存`,
    });
  }

  for (const [variantId, qty] of bonusStockDeductions) {
    const { data: bonusVariant } = await supabase
      .from("instock_product_variants")
      .select("stock_quantity")
      .eq("id", variantId)
      .single();
    if (!bonusVariant) continue;
    const newQuantity = bonusVariant.stock_quantity - qty;

    await supabase
      .from("instock_product_variants")
      .update({
        stock_quantity: newQuantity,
        is_sold_out: newQuantity <= 0,
      })
      .eq("id", variantId);

    await supabase.from("stock_logs").insert({
      instock_variant_id: variantId,
      change_qty: -qty,
      reason: `訂單 ${orderNumber} 保底選擇扣庫存`,
    });
  }

  revalidatePath("/member/instock-orders");
  revalidatePath("/instock");
  return {
    success: true,
    message: "現貨訂單已建立，請至賣貨便完成付款",
    orderNumber,
  };
}

// 現貨流程：買家完成賣貨便下單後，回到平台在該筆訂單填入賣貨便訂單編號，
// 讓後台出貨時可以對照。只有訂單本人（登入的會員）可以填寫，避免被亂改。
export async function setMarketplaceOrderNumber(
  orderId: string,
  marketplaceOrderNumber: string
): Promise<CreateOrderResult> {
  if (!marketplaceOrderNumber.trim()) {
    return { success: false, message: "請輸入賣貨便訂單編號" };
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return { success: false, message: "尚未設定 Supabase" };
  }

  const member = await getCurrentMember();
  if (!member) {
    return { success: false, message: "請先登入會員" };
  }

  const { data: order, error } = await supabase
    .from("orders")
    .update({ marketplace_order_number: marketplaceOrderNumber.trim() })
    .eq("id", orderId)
    .eq("user_id", member.id)
    .eq("order_type", "instock")
    .select("id")
    .maybeSingle();

  if (error) {
    return { success: false, message: error.message };
  }
  if (!order) {
    return { success: false, message: "找不到這筆訂單，或您不是這筆訂單的買家" };
  }

  revalidatePath("/member/instock-orders");
  revalidatePath("/admin/instock-orders");
  return { success: true, message: "已儲存賣貨便訂單編號" };
}

// 後台若需要協助買家修正打錯的賣貨便訂單編號，管理端不受會員身分限制。
export async function adminSetMarketplaceOrderNumber(
  orderId: string,
  marketplaceOrderNumber: string
): Promise<CreateOrderResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return { success: false, message: "尚未設定 Supabase" };
  }

  const { error } = await supabase
    .from("orders")
    .update({ marketplace_order_number: marketplaceOrderNumber.trim() || null })
    .eq("id", orderId)
    .eq("order_type", "instock");

  if (error) {
    return { success: false, message: error.message };
  }

  revalidatePath("/admin/instock-orders");
  revalidatePath("/member/instock-orders");
  return { success: true, message: "已更新賣貨便訂單編號" };
}

// 現貨沒有出貨批次追蹤，後台完成出貨核對後手動標記完成，
// 讓「已完成」訂單可以被允許永久刪除（見 deleteInstockOrder）。
export async function markInstockOrderCompleted(orderId: string): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { error } = await supabase
    .from("orders")
    .update({ status: "completed" })
    .eq("id", orderId)
    .eq("order_type", "instock");

  if (error) return { success: false, message: error.message };

  revalidatePath("/admin/instock-orders");
  revalidatePath("/member/instock-orders");
  return { success: true, message: "已標記為完成" };
}

// 現貨訂單可以永久刪除的條件（符合其中一項即可）：
// 1. 尚未填寫賣貨便訂單編號（買家還沒去賣貨便下單，這筆訂單等於還沒開始處理）。
// 2. 訂單已標記完成。
// 已填賣貨便訂單編號但尚未完成，代表正在出貨流程中，不可刪除。
export async function deleteInstockOrder(orderId: string): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { data: order } = await supabase
    .from("orders")
    .select("id, marketplace_order_number, status")
    .eq("id", orderId)
    .eq("order_type", "instock")
    .maybeSingle();

  if (!order) return { success: false, message: "找不到這筆訂單" };

  const deletable = !order.marketplace_order_number || order.status === "completed";
  if (!deletable) {
    return { success: false, message: "此現貨訂單已填寫賣貨便訂單編號但尚未完成，無法刪除。" };
  }

  const { error } = await supabase.from("orders").delete().eq("id", orderId);
  if (error) return { success: false, message: error.message };

  revalidatePath("/admin/instock-orders");
  revalidatePath("/member/instock-orders");
  return { success: true, message: "已永久刪除訂單" };
}
