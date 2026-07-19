"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireArtistShopAccess } from "@/lib/artist-context";
import type { ArrivalStatus } from "@/lib/types";
import { PREORDER_STATUS_LABEL } from "@/lib/product-status";
import { mapArrivalStatusToShipmentStatus } from "@/lib/shipment-status";

export interface ActionResult {
  success: boolean;
  message: string;
}

function revalidateArtistPaths(teacherId: string) {
  revalidatePath("/admin/artist/products");
  revalidatePath("/artist");
  revalidatePath(`/artist/teacher/${teacherId}`);
}

// 所有異動品項/細項的 action 都要先查出這個 group/variant 屬於哪一位繪師（teacher_id），
// 再用 requireArtistShopAccess 驗證目前登入身分是否有權操作——super_admin 永遠允許，
// artist 只有 teacher_id 跟自己相同才允許，不能只靠前端不顯示按鈕擋掉。
async function getGroupTeacherId(
  supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>,
  groupId: string
): Promise<string | null> {
  const { data } = await supabase.from("artist_product_groups").select("teacher_id").eq("id", groupId).maybeSingle();
  return data?.teacher_id ?? null;
}

async function getVariantTeacherId(
  supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>,
  variantId: string
): Promise<{ teacherId: string; groupId: string } | null> {
  const { data: variant } = await supabase
    .from("artist_product_variants")
    .select("artist_product_group_id")
    .eq("id", variantId)
    .maybeSingle();
  if (!variant) return null;
  const teacherId = await getGroupTeacherId(supabase, variant.artist_product_group_id);
  if (!teacherId) return null;
  return { teacherId, groupId: variant.artist_product_group_id };
}

export interface CreateArtistGroupInput {
  teacherId: string;
  name: string;
  price: number;
  imageUrls: string[];
  tags: string[];
  variantNames: string[];
}

export async function createArtistProductGroup(input: CreateArtistGroupInput): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const admin = await requireArtistShopAccess(input.teacherId);
  if (!admin) return { success: false, message: "沒有權限操作這間商店" };

  const trimmedName = input.name.trim();
  if (!trimmedName) return { success: false, message: "請輸入品項名稱" };
  const variantNames = input.variantNames.map((v) => v.trim()).filter(Boolean);
  if (variantNames.length === 0) return { success: false, message: "請至少新增一個細項" };

  const { data: topGroup } = await supabase
    .from("artist_product_groups")
    .select("sort_order")
    .eq("teacher_id", input.teacherId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: newGroup, error } = await supabase
    .from("artist_product_groups")
    .insert({
      teacher_id: input.teacherId,
      name: trimmedName,
      price: input.price,
      image_url: input.imageUrls[0] ?? null,
      tags: input.tags,
      sort_order: (topGroup?.sort_order ?? -1) + 1,
      arrival_status: "preordering",
    })
    .select("id")
    .single();

  if (error || !newGroup) return { success: false, message: error?.message ?? "建立品項失敗" };

  if (input.imageUrls.length > 0) {
    await supabase.from("artist_product_group_images").insert(
      input.imageUrls.map((url, index) => ({
        artist_product_group_id: newGroup.id,
        image_url: url,
        sort_order: index,
      }))
    );
  }

  await supabase.from("artist_product_variants").insert(
    variantNames.map((name, index) => ({
      artist_product_group_id: newGroup.id,
      name,
      sort_order: index,
    }))
  );

  revalidateArtistPaths(input.teacherId);
  return { success: true, message: `已建立品項「${trimmedName}」` };
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
  await supabase.from("artist_product_group_images").delete().eq("artist_product_group_id", groupId);
  if (imageUrls.length > 0) {
    await supabase.from("artist_product_group_images").insert(
      imageUrls.map((url, index) => ({
        artist_product_group_id: groupId,
        image_url: url,
        sort_order: index,
      }))
    );
  }
}

export async function updateArtistProductGroup(groupId: string, input: UpdateGroupInput): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const teacherId = await getGroupTeacherId(supabase, groupId);
  if (!teacherId) return { success: false, message: "找不到這個品項" };
  const admin = await requireArtistShopAccess(teacherId);
  if (!admin) return { success: false, message: "沒有權限操作這間商店" };

  if (!input.name.trim()) return { success: false, message: "請輸入品項名稱" };

  const { error } = await supabase
    .from("artist_product_groups")
    .update({
      name: input.name.trim(),
      price: input.price,
      image_url: input.imageUrls[0] ?? null,
      tags: input.tags,
    })
    .eq("id", groupId);

  if (error) return { success: false, message: error.message };

  await replaceGroupImages(supabase, groupId, input.imageUrls);
  revalidateArtistPaths(teacherId);
  return { success: true, message: "已更新品項" };
}

export async function archiveArtistProductGroup(groupId: string): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const teacherId = await getGroupTeacherId(supabase, groupId);
  if (!teacherId) return { success: false, message: "找不到這個品項" };
  const admin = await requireArtistShopAccess(teacherId);
  if (!admin) return { success: false, message: "沒有權限操作這間商店" };

  const { error } = await supabase.from("artist_product_groups").update({ is_archived: true }).eq("id", groupId);
  if (error) return { success: false, message: error.message };

  revalidateArtistPaths(teacherId);
  return { success: true, message: "已封存品項" };
}

export async function setArtistGroupArrivalStatus(groupId: string, status: ArrivalStatus): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const teacherId = await getGroupTeacherId(supabase, groupId);
  if (!teacherId) return { success: false, message: "找不到這個品項" };
  const admin = await requireArtistShopAccess(teacherId);
  if (!admin) return { success: false, message: "沒有權限操作這間商店" };

  const { error } = await supabase.from("artist_product_groups").update({ arrival_status: status }).eq("id", groupId);
  if (error) return { success: false, message: error.message };

  const shipmentItemStatus = mapArrivalStatusToShipmentStatus(status);
  const { data: relatedOrderItems } = await supabase.from("order_items").select("id").eq("artist_group_id", groupId);
  const orderItemIds = (relatedOrderItems ?? []).map((oi) => oi.id);
  if (orderItemIds.length > 0) {
    await supabase
      .from("shipment_items")
      .update({ status: shipmentItemStatus, updated_at: new Date().toISOString() })
      .in("order_item_id", orderItemIds)
      .is("shipment_id", null);
  }

  revalidateArtistPaths(teacherId);
  revalidatePath("/admin/artist/orders");
  return { success: true, message: `已標記為「${PREORDER_STATUS_LABEL[status]}」` };
}

export async function addArtistVariant(groupId: string, name: string): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const teacherId = await getGroupTeacherId(supabase, groupId);
  if (!teacherId) return { success: false, message: "找不到這個品項" };
  const admin = await requireArtistShopAccess(teacherId);
  if (!admin) return { success: false, message: "沒有權限操作這間商店" };

  const trimmed = name.trim();
  if (!trimmed) return { success: false, message: "請輸入細項名稱" };

  const { data: topVariant } = await supabase
    .from("artist_product_variants")
    .select("sort_order")
    .eq("artist_product_group_id", groupId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("artist_product_variants").insert({
    artist_product_group_id: groupId,
    name: trimmed,
    sort_order: (topVariant?.sort_order ?? -1) + 1,
  });

  if (error) return { success: false, message: error.message };
  revalidateArtistPaths(teacherId);
  return { success: true, message: "已新增細項" };
}

export async function renameArtistVariant(variantId: string, name: string): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const info = await getVariantTeacherId(supabase, variantId);
  if (!info) return { success: false, message: "找不到這個細項" };
  const admin = await requireArtistShopAccess(info.teacherId);
  if (!admin) return { success: false, message: "沒有權限操作這間商店" };

  const trimmed = name.trim();
  if (!trimmed) return { success: false, message: "請輸入細項名稱" };

  const { error } = await supabase.from("artist_product_variants").update({ name: trimmed }).eq("id", variantId);
  if (error) return { success: false, message: error.message };

  revalidateArtistPaths(info.teacherId);
  return { success: true, message: "已更新細項" };
}

export async function toggleArtistVariantActive(variantId: string, isActive: boolean): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const info = await getVariantTeacherId(supabase, variantId);
  if (!info) return { success: false, message: "找不到這個細項" };
  const admin = await requireArtistShopAccess(info.teacherId);
  if (!admin) return { success: false, message: "沒有權限操作這間商店" };

  const { error } = await supabase.from("artist_product_variants").update({ is_active: isActive }).eq("id", variantId);
  if (error) return { success: false, message: error.message };

  revalidateArtistPaths(info.teacherId);
  return { success: true, message: isActive ? "已上架細項" : "已下架細項" };
}

export async function setArtistBlindDrawConfig(
  groupId: string,
  input: { isBlindDraw: boolean; thresholdQty: number | null; pickQty: number | null }
): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const teacherId = await getGroupTeacherId(supabase, groupId);
  if (!teacherId) return { success: false, message: "找不到這個品項" };
  const admin = await requireArtistShopAccess(teacherId);
  if (!admin) return { success: false, message: "沒有權限操作這間商店" };

  if (input.isBlindDraw) {
    if (!input.thresholdQty || input.thresholdQty <= 0) return { success: false, message: "請輸入每買幾件" };
    if (!input.pickQty || input.pickQty <= 0) return { success: false, message: "請輸入可選幾個保底" };
  }

  const { error } = await supabase
    .from("artist_product_groups")
    .update({
      is_blind_draw: input.isBlindDraw,
      blind_draw_threshold_qty: input.isBlindDraw ? input.thresholdQty : null,
      blind_draw_pick_qty: input.isBlindDraw ? input.pickQty : null,
    })
    .eq("id", groupId);

  if (error) return { success: false, message: error.message };
  revalidateArtistPaths(teacherId);
  return { success: true, message: input.isBlindDraw ? "已設定盲抽" : "已關閉盲抽" };
}

export async function toggleArtistGroupCpSpoiler(groupId: string, isCpSpoiler: boolean): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const teacherId = await getGroupTeacherId(supabase, groupId);
  if (!teacherId) return { success: false, message: "找不到這個品項" };
  const admin = await requireArtistShopAccess(teacherId);
  if (!admin) return { success: false, message: "沒有權限操作這間商店" };

  const { error } = await supabase.from("artist_product_groups").update({ is_cp_spoiler: isCpSpoiler }).eq("id", groupId);
  if (error) return { success: false, message: error.message };

  revalidateArtistPaths(teacherId);
  return { success: true, message: isCpSpoiler ? "已開啟 CP 防雷" : "已關閉 CP 防雷" };
}

export async function toggleArtistVariantBonusOption(variantId: string, isBonusOption: boolean): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const info = await getVariantTeacherId(supabase, variantId);
  if (!info) return { success: false, message: "找不到這個細項" };
  const admin = await requireArtistShopAccess(info.teacherId);
  if (!admin) return { success: false, message: "沒有權限操作這間商店" };

  const { error } = await supabase
    .from("artist_product_variants")
    .update({ is_bonus_option: isBonusOption })
    .eq("id", variantId);
  if (error) return { success: false, message: error.message };

  revalidateArtistPaths(info.teacherId);
  return { success: true, message: isBonusOption ? "已設為可選保底" : "已取消可選保底" };
}

export async function setArtistGroupSurcharge(
  groupId: string,
  amount: number | null,
  reason: string
): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const teacherId = await getGroupTeacherId(supabase, groupId);
  if (!teacherId) return { success: false, message: "找不到這個品項" };
  const admin = await requireArtistShopAccess(teacherId);
  if (!admin) return { success: false, message: "沒有權限操作這間商店" };

  const { error } = await supabase
    .from("artist_product_groups")
    .update({ surcharge_amount: amount, surcharge_reason: reason.trim() || null })
    .eq("id", groupId);
  if (error) return { success: false, message: error.message };

  revalidateArtistPaths(teacherId);
  return { success: true, message: "已儲存二補設定" };
}

export async function setArtistVariantSurcharge(
  variantId: string,
  amount: number | null,
  reason: string
): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const info = await getVariantTeacherId(supabase, variantId);
  if (!info) return { success: false, message: "找不到這個細項" };
  const admin = await requireArtistShopAccess(info.teacherId);
  if (!admin) return { success: false, message: "沒有權限操作這間商店" };

  const { error } = await supabase
    .from("artist_product_variants")
    .update({ surcharge_amount: amount, surcharge_reason: reason.trim() || null })
    .eq("id", variantId);
  if (error) return { success: false, message: error.message };

  revalidateArtistPaths(info.teacherId);
  return { success: true, message: "已儲存二補設定" };
}

// 商店設定：商店名稱、封面圖、預購時間、匯款開始/截止時間、銀行資訊、賣貨便說明。
export interface UpdateArtistShopSettingsInput {
  name: string;
  imageUrls: string[];
  preorderStartsAt: string | null;
  preorderEndsAt: string | null;
  remittanceStartsAt: string | null;
  remittanceEndsAt: string | null;
  bankName: string;
  bankCode: string;
  accountName: string;
  accountNumber: string;
  remittanceNote: string;
  marketplaceNote: string;
}

export async function updateArtistShopSettings(
  teacherId: string,
  input: UpdateArtistShopSettingsInput
): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const admin = await requireArtistShopAccess(teacherId);
  if (!admin) return { success: false, message: "沒有權限操作這間商店" };

  const trimmedName = input.name.trim();
  if (!trimmedName) return { success: false, message: "請輸入商店名稱" };

  const { error } = await supabase
    .from("teachers")
    .update({
      name: trimmedName,
      preorder_starts_at: input.preorderStartsAt,
      preorder_ends_at: input.preorderEndsAt,
      remittance_starts_at: input.remittanceStartsAt,
      remittance_ends_at: input.remittanceEndsAt,
      bank_name: input.bankName.trim() || null,
      bank_code: input.bankCode.trim() || null,
      account_name: input.accountName.trim() || null,
      account_number: input.accountNumber.trim() || null,
      remittance_note: input.remittanceNote.trim() || null,
      marketplace_note: input.marketplaceNote.trim() || null,
    })
    .eq("id", teacherId);

  if (error) return { success: false, message: error.message };

  await supabase.from("teacher_images").delete().eq("teacher_id", teacherId);
  if (input.imageUrls.length > 0) {
    await supabase.from("teacher_images").insert(
      input.imageUrls.map((url, index) => ({
        teacher_id: teacherId,
        image_url: url,
        sort_order: index,
      }))
    );
  }

  revalidateArtistPaths(teacherId);
  revalidatePath("/admin/artist/settings");
  revalidatePath("/admin/artist");
  return { success: true, message: "已更新商店設定" };
}

export interface ArtistBlindDrawGroupConfig {
  groupId: string;
  thresholdQty: number;
  pickQty: number;
  options: { variantId: string; variantName: string }[];
}

// 給繪師預購購物車頁用：查詢購物車裡有哪些品項開啟了盲抽，跟 teacher-shop.ts 的
// getBlindDrawOptionsForGroups 邏輯完全對應，只是換成 artist_product_groups/variants。
// 唯讀公開資訊，不需要 requireArtistShopAccess。
export async function getArtistBlindDrawOptionsForGroups(groupIds: string[]): Promise<ArtistBlindDrawGroupConfig[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase || groupIds.length === 0) return [];

  const { data: groups } = await supabase
    .from("artist_product_groups")
    .select("id, blind_draw_threshold_qty, blind_draw_pick_qty")
    .in("id", groupIds)
    .eq("is_blind_draw", true);

  const blindDrawGroups = groups ?? [];
  if (blindDrawGroups.length === 0) return [];

  const blindDrawGroupIds = blindDrawGroups.map((g) => g.id);
  const { data: variants } = await supabase
    .from("artist_product_variants")
    .select("id, artist_product_group_id, name")
    .in("artist_product_group_id", blindDrawGroupIds)
    .eq("is_bonus_option", true)
    .eq("is_active", true);

  const optionsByGroup = new Map<string, { variantId: string; variantName: string }[]>();
  for (const v of variants ?? []) {
    const list = optionsByGroup.get(v.artist_product_group_id) ?? [];
    list.push({ variantId: v.id, variantName: v.name });
    optionsByGroup.set(v.artist_product_group_id, list);
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
