"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getUniqueTeacherCode } from "@/lib/teacher-code";
import type { ArrivalStatus } from "@/lib/types";
import { PREORDER_STATUS_LABEL } from "@/lib/product-status";
import { mapArrivalStatusToShipmentStatus } from "@/lib/shipment-status";
import { getGroupDeletePreview, permanentlyDeleteGroup, type GroupDeletePreview } from "@/lib/product-group-delete";

export interface ActionResult {
  success: boolean;
  message: string;
}

function revalidateShopPaths() {
  revalidatePath("/admin/preorder-products");
  revalidatePath("/preorder");
  revalidatePath("/preorder/teacher", "layout");
}

export interface BatchGroupInput {
  name: string;
  price: number;
  imageUrls: string[];
  tags: string[];
  variantNames: string[];
}

export interface BatchCreateResult extends ActionResult {
  teacherCode?: string;
}

// 一次建立整個老師賣場：老師（找得到既有名稱就沿用，找不到就自動建立）+ 預購時間
// + 多個品項（product_groups）+ 每個品項底下的多個細項（product_variants）。
export async function createTeacherShopBatch(
  teacherName: string,
  preorderStartsAt: string | null,
  preorderEndsAt: string | null,
  groups: BatchGroupInput[],
  imageUrls: string[] = []
): Promise<BatchCreateResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const trimmedTeacherName = teacherName.trim();
  if (!trimmedTeacherName) return { success: false, message: "請輸入老師名稱" };

  const validGroups = groups
    .filter((g) => g.name.trim())
    .map((g) => ({
      ...g,
      name: g.name.trim(),
      variantNames: g.variantNames.map((v) => v.trim()).filter(Boolean),
    }));

  if (validGroups.length === 0) return { success: false, message: "請至少新增一個品項" };
  if (validGroups.some((g) => g.variantNames.length === 0)) {
    return { success: false, message: "每個品項至少需要一個細項" };
  }

  const { data: existingTeacher } = await supabase
    .from("teachers")
    .select("id, teacher_code")
    .eq("name", trimmedTeacherName)
    .maybeSingle();

  let teacherId: string;
  let teacherCode: string;

  if (existingTeacher) {
    teacherId = existingTeacher.id;
    teacherCode = existingTeacher.teacher_code;
    await supabase
      .from("teachers")
      .update({
        preorder_starts_at: preorderStartsAt,
        preorder_ends_at: preorderEndsAt,
      })
      .eq("id", teacherId);
  } else {
    const { data: topTeacher } = await supabase
      .from("teachers")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const code = await getUniqueTeacherCode(supabase);
    const { data: newTeacher, error: teacherError } = await supabase
      .from("teachers")
      .insert({
        teacher_code: code,
        name: trimmedTeacherName,
        sort_order: (topTeacher?.sort_order ?? 0) + 1,
        is_active: true,
        preorder_starts_at: preorderStartsAt,
        preorder_ends_at: preorderEndsAt,
      })
      .select("id, teacher_code")
      .single();

    if (teacherError || !newTeacher) {
      return { success: false, message: teacherError?.message ?? `建立老師「${trimmedTeacherName}」失敗` };
    }
    teacherId = newTeacher.id;
    teacherCode = newTeacher.teacher_code;

    // 封面圖只在「新建立」老師時套用，避免批量上架表單不小心覆蓋掉既有老師已經編輯好的封面圖
    // （既有老師的封面圖請到賣場列表裡的「老師賣場封面圖」區塊編輯）。
    if (imageUrls.length > 0) {
      await supabase.from("teacher_images").insert(
        imageUrls.map((url, index) => ({
          teacher_id: teacherId,
          image_url: url,
          sort_order: index,
        }))
      );
    }
  }

  const { data: topGroup } = await supabase
    .from("product_groups")
    .select("sort_order")
    .eq("teacher_id", teacherId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  let nextSortOrder = (topGroup?.sort_order ?? -1) + 1;

  let createdGroups = 0;
  const failedNames: string[] = [];

  for (const group of validGroups) {
    const { data: newGroup, error: groupError } = await supabase
      .from("product_groups")
      .insert({
        teacher_id: teacherId,
        name: group.name,
        price: group.price,
        image_url: group.imageUrls[0] ?? null,
        tags: group.tags,
        sort_order: nextSortOrder,
        arrival_status: "preordering",
      })
      .select("id")
      .single();

    if (groupError || !newGroup) {
      failedNames.push(group.name);
      continue;
    }
    nextSortOrder += 1;

    if (group.imageUrls.length > 0) {
      await supabase.from("product_group_images").insert(
        group.imageUrls.map((url, index) => ({
          product_group_id: newGroup.id,
          image_url: url,
          sort_order: index,
        }))
      );
    }

    await supabase.from("product_variants").insert(
      group.variantNames.map((name, index) => ({
        product_group_id: newGroup.id,
        name,
        sort_order: index,
      }))
    );

    createdGroups++;
  }

  revalidateShopPaths();

  if (createdGroups === 0) {
    return { success: false, message: "品項建立失敗，請確認欄位是否正確", teacherCode };
  }

  const failedNote = failedNames.length > 0 ? `，失敗品項：${failedNames.join("、")}` : "";
  return {
    success: true,
    message: `已在「${trimmedTeacherName}」（Teacher ID：${teacherCode}）底下建立 ${createdGroups} 個品項${failedNote}`,
    teacherCode,
  };
}

export async function updateTeacherPreorderWindow(
  teacherId: string,
  preorderStartsAt: string | null,
  preorderEndsAt: string | null
): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { error } = await supabase
    .from("teachers")
    .update({ preorder_starts_at: preorderStartsAt, preorder_ends_at: preorderEndsAt })
    .eq("id", teacherId);

  if (error) return { success: false, message: error.message };

  revalidateShopPaths();
  return { success: true, message: "已更新預購時間" };
}

interface UpdateGroupInput {
  name: string;
  price: number;
  imageUrls: string[];
  tags: string[];
}

async function replaceGroupImages(
  supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>,
  groupId: string,
  imageUrls: string[]
) {
  await supabase.from("product_group_images").delete().eq("product_group_id", groupId);
  if (imageUrls.length > 0) {
    await supabase.from("product_group_images").insert(
      imageUrls.map((url, index) => ({
        product_group_id: groupId,
        image_url: url,
        sort_order: index,
      }))
    );
  }
}

export async function updateProductGroup(groupId: string, input: UpdateGroupInput): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };
  if (!input.name.trim()) return { success: false, message: "請輸入品項名稱" };

  const { error } = await supabase
    .from("product_groups")
    .update({
      name: input.name.trim(),
      price: input.price,
      image_url: input.imageUrls[0] ?? null,
      tags: input.tags,
    })
    .eq("id", groupId);

  if (error) return { success: false, message: error.message };

  await replaceGroupImages(supabase, groupId, input.imageUrls);

  revalidateShopPaths();
  return { success: true, message: "已更新品項" };
}

export async function archiveProductGroup(groupId: string): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { error } = await supabase.from("product_groups").update({ is_archived: true }).eq("id", groupId);
  if (error) return { success: false, message: error.message };

  revalidateShopPaths();
  revalidatePath("/admin/archived-products");
  return { success: true, message: "已封存品項" };
}

export async function restoreProductGroup(groupId: string): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { error } = await supabase.from("product_groups").update({ is_archived: false }).eq("id", groupId);
  if (error) return { success: false, message: error.message };

  revalidateShopPaths();
  revalidatePath("/admin/archived-products");
  return { success: true, message: "已恢復品項" };
}

export async function getProductGroupDeletePreview(groupId: string): Promise<GroupDeletePreview | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  return getGroupDeletePreview(supabase, "preorder", groupId);
}

export async function permanentlyDeleteProductGroup(groupId: string): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const result = await permanentlyDeleteGroup(supabase, "preorder", groupId);
  if (!result.success) return { success: false, message: result.message };

  revalidateShopPaths();
  revalidatePath("/admin/archived-products");
  return { success: true, message: result.message };
}

// 品項到貨狀態，沿用預購商品既有的 5 階段狀態，用法跟舊的 setArrivalStatus 一樣，
// 只是對象從「商品」改成「品項」，並依 product_group_id 同步尚未合併出貨的 shipment_items。
export async function setGroupArrivalStatus(groupId: string, status: ArrivalStatus): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { error } = await supabase.from("product_groups").update({ arrival_status: status }).eq("id", groupId);
  if (error) return { success: false, message: error.message };

  // 尚未合併出貨的商品直接跟著品項狀態走（不是收斂成單一個「已到貨」），
  // 訂單頁跟商品後台才會顯示一致的狀態。已經合併出貨的批次是獨立的出貨流程，不受這裡影響。
  const shipmentItemStatus = mapArrivalStatusToShipmentStatus(status);

  const { data: relatedOrderItems } = await supabase
    .from("order_items")
    .select("id")
    .eq("product_group_id", groupId);

  const orderItemIds = (relatedOrderItems ?? []).map((oi) => oi.id);
  if (orderItemIds.length > 0) {
    await supabase
      .from("shipment_items")
      .update({ status: shipmentItemStatus, updated_at: new Date().toISOString() })
      .in("order_item_id", orderItemIds)
      .is("shipment_id", null);
  }

  revalidatePath("/admin/preorder-products");
  revalidatePath("/admin/preorder-orders");
  revalidatePath("/preorder");
  return { success: true, message: `已標記為「${PREORDER_STATUS_LABEL[status]}」` };
}

export async function addVariant(groupId: string, name: string): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };
  const trimmed = name.trim();
  if (!trimmed) return { success: false, message: "請輸入細項名稱" };

  const { data: topVariant } = await supabase
    .from("product_variants")
    .select("sort_order")
    .eq("product_group_id", groupId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("product_variants").insert({
    product_group_id: groupId,
    name: trimmed,
    sort_order: (topVariant?.sort_order ?? -1) + 1,
  });

  if (error) return { success: false, message: error.message };

  revalidateShopPaths();
  return { success: true, message: "已新增細項" };
}

export async function renameVariant(variantId: string, name: string): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };
  const trimmed = name.trim();
  if (!trimmed) return { success: false, message: "請輸入細項名稱" };

  const { error } = await supabase.from("product_variants").update({ name: trimmed }).eq("id", variantId);
  if (error) return { success: false, message: error.message };

  revalidateShopPaths();
  return { success: true, message: "已更新細項" };
}

export async function toggleVariantActive(variantId: string, isActive: boolean): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { error } = await supabase.from("product_variants").update({ is_active: isActive }).eq("id", variantId);
  if (error) return { success: false, message: error.message };

  revalidateShopPaths();
  return { success: true, message: isActive ? "已上架細項" : "已下架細項" };
}

// 盲抽/滿抽選品設定：買滿 thresholdQty 抽可以選 pickQty 個保底細項，每達成一次門檻可再多選
// （例如買 5 抽選 1 個、買 10 抽選 2 個）。關閉時把門檻/可選數量清空，避免殘留舊設定造成混淆。
export async function setBlindDrawConfig(
  groupId: string,
  input: { isBlindDraw: boolean; thresholdQty: number | null; pickQty: number | null }
): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  if (input.isBlindDraw) {
    if (!input.thresholdQty || input.thresholdQty <= 0) {
      return { success: false, message: "請輸入每買幾抽" };
    }
    if (!input.pickQty || input.pickQty <= 0) {
      return { success: false, message: "請輸入可選幾個保底" };
    }
  }

  const { error } = await supabase
    .from("product_groups")
    .update({
      is_blind_draw: input.isBlindDraw,
      blind_draw_threshold_qty: input.isBlindDraw ? input.thresholdQty : null,
      blind_draw_pick_qty: input.isBlindDraw ? input.pickQty : null,
    })
    .eq("id", groupId);

  if (error) return { success: false, message: error.message };

  revalidateShopPaths();
  return { success: true, message: input.isBlindDraw ? "已設定盲抽" : "已關閉盲抽" };
}

// CP 防雷：前台預設模糊遮罩蓋住品項圖片，客人點一下才看到圖片，只影響圖片顯示。
export async function toggleGroupCpSpoiler(groupId: string, isCpSpoiler: boolean): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { error } = await supabase
    .from("product_groups")
    .update({ is_cp_spoiler: isCpSpoiler })
    .eq("id", groupId);
  if (error) return { success: false, message: error.message };

  revalidateShopPaths();
  return { success: true, message: isCpSpoiler ? "已開啟 CP 防雷" : "已關閉 CP 防雷" };
}

export async function toggleVariantBonusOption(
  variantId: string,
  isBonusOption: boolean
): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { error } = await supabase
    .from("product_variants")
    .update({ is_bonus_option: isBonusOption })
    .eq("id", variantId);
  if (error) return { success: false, message: error.message };

  revalidateShopPaths();
  return { success: true, message: isBonusOption ? "已設為可選保底" : "已取消可選保底" };
}

// 二補金額：商品到貨後才知道需要追加補款，設在品項/細項上，建立出貨訂單時會自動帶入補款紀錄
// （見 mergeShipmentItems）。金額可以是 0（代表已確認不需要追加，但仍想記錄原因），
// 傳空字串代表「清除設定」（恢復成未設定，不會自動產生二補）。
export async function setGroupSurcharge(
  groupId: string,
  amount: number | null,
  reason: string
): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { error } = await supabase
    .from("product_groups")
    .update({ surcharge_amount: amount, surcharge_reason: reason.trim() || null })
    .eq("id", groupId);
  if (error) return { success: false, message: error.message };

  revalidateShopPaths();
  return { success: true, message: "已儲存二補設定" };
}

export async function setVariantSurcharge(
  variantId: string,
  amount: number | null,
  reason: string
): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { error } = await supabase
    .from("product_variants")
    .update({ surcharge_amount: amount, surcharge_reason: reason.trim() || null })
    .eq("id", variantId);
  if (error) return { success: false, message: error.message };

  revalidateShopPaths();
  return { success: true, message: "已儲存二補設定" };
}

export interface BlindDrawGroupConfig {
  groupId: string;
  thresholdQty: number;
  pickQty: number;
  options: { variantId: string; variantName: string }[];
}

// 給購物車頁用：查詢購物車裡有哪些品項開啟了盲抽，以及各自的門檻/可選數量/可選細項清單。
// 只回傳真的有開啟盲抽的品項，購物車頁據此決定要不要顯示「可選保底」區塊。
export async function getBlindDrawOptionsForGroups(groupIds: string[]): Promise<BlindDrawGroupConfig[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase || groupIds.length === 0) return [];

  const { data: groups } = await supabase
    .from("product_groups")
    .select("id, blind_draw_threshold_qty, blind_draw_pick_qty")
    .in("id", groupIds)
    .eq("is_blind_draw", true);

  const blindDrawGroups = groups ?? [];
  if (blindDrawGroups.length === 0) return [];

  const blindDrawGroupIds = blindDrawGroups.map((g) => g.id);
  const { data: variants } = await supabase
    .from("product_variants")
    .select("id, product_group_id, name")
    .in("product_group_id", blindDrawGroupIds)
    .eq("is_bonus_option", true)
    .eq("is_active", true);

  const optionsByGroup = new Map<string, { variantId: string; variantName: string }[]>();
  for (const v of variants ?? []) {
    const list = optionsByGroup.get(v.product_group_id) ?? [];
    list.push({ variantId: v.id, variantName: v.name });
    optionsByGroup.set(v.product_group_id, list);
  }

  return blindDrawGroups
    .filter((g) => g.blind_draw_threshold_qty && g.blind_draw_pick_qty)
    .map((g) => ({
      groupId: g.id,
      thresholdQty: g.blind_draw_threshold_qty as number,
      pickQty: g.blind_draw_pick_qty as number,
      options: optionsByGroup.get(g.id) ?? [],
    }));
}
