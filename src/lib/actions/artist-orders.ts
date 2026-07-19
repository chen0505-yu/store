"use server";

import { revalidatePath } from "next/cache";
import { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/auth";
import type { ArrivalStatus } from "@/lib/types";
import type { ArtistCartItem } from "@/lib/cart/use-artist-cart";
import { getPreorderPhase } from "@/lib/product-availability";
import { mapArrivalStatusToShipmentStatus } from "@/lib/shipment-status";
import type { BonusSelectionInput } from "@/lib/actions/orders";
import { getCurrentAdmin } from "@/lib/admin-auth";

export interface CreateOrderResult {
  success: boolean;
  message: string;
  orderNumber?: string;
}

const BLACKLIST_MESSAGE = "您的帳號目前無法下單，請聯繫管理員。";

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

async function getArtistGroupSnapshots(
  supabase: SupabaseClient,
  groupIds: string[]
): Promise<Map<string, GroupSnapshot>> {
  const { data: groups } = await supabase
    .from("artist_product_groups")
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

async function createArtistShipmentItemsForGroups(
  supabase: SupabaseClient,
  orderId: string,
  createdOrderItems: { id: string; artist_group_id: string | null }[],
  snapshots: Map<string, GroupSnapshot>
) {
  const rows = createdOrderItems.map((oi) => {
    const snapshot = oi.artist_group_id ? snapshots.get(oi.artist_group_id) : undefined;
    const status = snapshot ? mapArrivalStatusToShipmentStatus(snapshot.arrivalStatus) : "not_arrived";
    return {
      order_item_id: oi.id,
      order_id: orderId,
      order_type: "artist" as const,
      status,
    };
  });

  const { error } = await supabase.from("shipment_items").insert(rows);
  if (error) {
    throw new Error(error.message);
  }
}

// 繪師預購下單：跟葴葴預購（createPreorderOrder）幾乎一致，差別是不支援活動現場取貨
// （不在本次需求範圍），且購物車本身在加入時就已經限制只能有一位繪師的商品
// （見 use-artist-cart.ts），這裡下單前仍會重新驗證一次，避免前端資料被繞過。
export async function createArtistOrder(
  items: ArtistCartItem[],
  customerName: string,
  bonusSelections: BonusSelectionInput[] = []
): Promise<CreateOrderResult> {
  if (items.length === 0) {
    return { success: false, message: "購物車是空的" };
  }
  if (!customerName.trim()) {
    return { success: false, message: "請輸入客戶名稱" };
  }

  const teacherIds = Array.from(new Set(items.map((i) => i.teacherId)));
  if (teacherIds.length > 1) {
    return { success: false, message: "購物車一次只能結帳一位繪師的商品" };
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

  const variantIds = items.map((i) => i.variantId);
  const { data: variantRows } = await supabase
    .from("artist_product_variants")
    .select("id, is_active")
    .in("id", variantIds);
  const variantMap = new Map((variantRows ?? []).map((v) => [v.id, v]));

  const groupIds = Array.from(new Set(items.map((i) => i.productGroupId)));
  const groupSnapshots = await getArtistGroupSnapshots(supabase, groupIds);

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

  const bonusGroupIds = Array.from(new Set(bonusSelections.map((b) => b.groupId)));
  const bonusInsertRows: { condition_product_name: string; bonus_product_name: string; quantity: number }[] = [];

  if (bonusGroupIds.length > 0) {
    const [{ data: blindDrawGroups }, { data: bonusVariants }] = await Promise.all([
      supabase
        .from("artist_product_groups")
        .select("id, name, is_blind_draw, blind_draw_threshold_qty, blind_draw_pick_qty")
        .in("id", bonusGroupIds),
      supabase
        .from("artist_product_variants")
        .select("id, artist_product_group_id, name, is_bonus_option, is_active")
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

    for (const [groupId, selectedVariantIds] of selectionsByGroup) {
      const group = blindDrawGroupMap.get(groupId);
      if (!group || !group.is_blind_draw || !group.blind_draw_threshold_qty || !group.blind_draw_pick_qty) {
        return { success: false, message: "保底選擇的品項未開放盲抽，請重新整理購物車" };
      }
      const purchasedQty = items
        .filter((i) => i.productGroupId === groupId)
        .reduce((sum, i) => sum + i.quantity, 0);
      const allowed = Math.floor(purchasedQty / group.blind_draw_threshold_qty) * group.blind_draw_pick_qty;
      if (selectedVariantIds.length > allowed) {
        return { success: false, message: `「${group.name}」保底選擇超過可選數量，請重新整理購物車` };
      }
      for (const variantId of selectedVariantIds) {
        const variant = bonusVariantMap.get(variantId);
        if (
          !variant ||
          variant.artist_product_group_id !== groupId ||
          !variant.is_bonus_option ||
          !variant.is_active
        ) {
          return { success: false, message: "保底選擇的細項無效，請重新整理購物車" };
        }
      }
    }

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

  const orderNumber = await generateOrderNumber(supabase);
  const totalAmount = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      order_number: orderNumber,
      user_id: member.id,
      order_type: "artist",
      status: "pending_payment",
      payment_status: "not_remitted",
      total_amount: totalAmount,
      customer_name: customerName.trim(),
      pickup_method: "shipment",
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
          artist_group_id: item.productGroupId,
          artist_group_name: item.productGroupName,
          artist_variant_id: item.variantId,
          artist_variant_name: item.variantName,
          quantity: item.quantity,
          price: item.unitPrice,
        };
      })
    )
    .select("id, artist_group_id");

  if (itemsError || !createdItems) {
    return { success: false, message: itemsError?.message ?? "建立訂單明細失敗" };
  }

  await createArtistShipmentItemsForGroups(supabase, order.id, createdItems, groupSnapshots);

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

  revalidatePath("/member/artist-orders");
  return {
    success: true,
    message: "繪師預購訂單已建立，請完成匯款",
    orderNumber,
  };
}

export interface ActionResult {
  success: boolean;
  message: string;
}

const ARTIST_ORDER_NOT_FINISHED_MESSAGE = "此訂單尚未完成，無法刪除。";

// 繪師預購訂單永久刪除：跟葴葴預購的 deletePreorderOrder 規則完全相同（未付款且尚未出貨，
// 或全部品項都已出貨完成才能刪除），差別是權限限定 super_admin 或這張訂單所屬的繪師本人。
export async function deleteArtistOrder(orderId: string): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { data: order } = await supabase
    .from("orders")
    .select("id, payment_status")
    .eq("id", orderId)
    .eq("order_type", "artist")
    .maybeSingle();
  if (!order) return { success: false, message: "找不到這筆訂單" };

  const { data: orderItems } = await supabase.from("order_items").select("id, artist_group_id").eq("order_id", orderId);
  const groupIds = Array.from(
    new Set((orderItems ?? []).map((oi) => oi.artist_group_id).filter((id): id is string => Boolean(id)))
  );
  const { data: groups } =
    groupIds.length > 0 ? await supabase.from("artist_product_groups").select("teacher_id").in("id", groupIds) : { data: [] };
  const teacherId = groups?.[0]?.teacher_id ?? null;

  const admin = await getCurrentAdmin();
  const authorized = admin?.role === "super_admin" || (admin?.role === "artist" && admin.teacherId === teacherId);
  if (!authorized) return { success: false, message: "沒有權限執行此操作" };

  const { data: shipmentItems } = await supabase.from("shipment_items").select("status, shipment_id").eq("order_id", orderId);
  const items = shipmentItems ?? [];
  const notRemittedAndUnmerged = order.payment_status === "not_remitted" && items.every((i) => !i.shipment_id);
  const allShippedCompleted = items.length > 0 && items.every((i) => i.status === "completed");

  if (!notRemittedAndUnmerged && !allShippedCompleted) {
    return { success: false, message: ARTIST_ORDER_NOT_FINISHED_MESSAGE };
  }

  const { error } = await supabase.from("orders").delete().eq("id", orderId);
  if (error) return { success: false, message: error.message };

  revalidatePath("/admin/artist/orders");
  revalidatePath("/admin/artist/shipments");
  revalidatePath("/member/artist-orders");
  revalidatePath("/member/shipment-orders");
  return { success: true, message: "已永久刪除訂單" };
}
