"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getUniqueTeacherCode } from "@/lib/teacher-code";

export interface ActionResult {
  success: boolean;
  message: string;
}

function revalidateInstockShopPaths() {
  revalidatePath("/admin/instock-products");
  revalidatePath("/instock");
  revalidatePath("/instock/teacher", "layout");
}

export interface BatchInstockVariantInput {
  name: string;
  stock: number;
}

export interface BatchInstockGroupInput {
  name: string;
  price: number;
  imageUrls: string[];
  tags: string[];
  variants: BatchInstockVariantInput[];
}

export interface BatchCreateResult extends ActionResult {
  teacherCode?: string;
}

// 一次建立整個老師現貨賣場：老師（找得到既有名稱就沿用，找不到就自動建立）
// + 多個品項（instock_product_groups）+ 每個品項底下的多個細項（instock_product_variants，含庫存）。
export async function createInstockShopBatch(
  teacherName: string,
  groups: BatchInstockGroupInput[],
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
      variants: g.variants.map((v) => ({ ...v, name: v.name.trim() })).filter((v) => v.name),
    }));

  if (validGroups.length === 0) return { success: false, message: "請至少新增一個品項" };
  if (validGroups.some((g) => g.variants.length === 0)) {
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
      })
      .select("id, teacher_code")
      .single();

    if (teacherError || !newTeacher) {
      return { success: false, message: teacherError?.message ?? `建立老師「${trimmedTeacherName}」失敗` };
    }
    teacherId = newTeacher.id;
    teacherCode = newTeacher.teacher_code;

    // 封面圖只在「新建立」老師時套用，避免批量上架表單不小心覆蓋掉既有老師已經編輯好的封面圖。
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
    .from("instock_product_groups")
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
      .from("instock_product_groups")
      .insert({
        teacher_id: teacherId,
        name: group.name,
        price: group.price,
        image_url: group.imageUrls[0] ?? null,
        tags: group.tags,
        sort_order: nextSortOrder,
      })
      .select("id")
      .single();

    if (groupError || !newGroup) {
      failedNames.push(group.name);
      continue;
    }
    nextSortOrder += 1;

    if (group.imageUrls.length > 0) {
      await supabase.from("instock_product_group_images").insert(
        group.imageUrls.map((url, index) => ({
          instock_product_group_id: newGroup.id,
          image_url: url,
          sort_order: index,
        }))
      );
    }

    await supabase.from("instock_product_variants").insert(
      group.variants.map((v, index) => ({
        instock_product_group_id: newGroup.id,
        name: v.name,
        stock_quantity: v.stock,
        is_sold_out: v.stock <= 0,
        sort_order: index,
      }))
    );

    createdGroups++;
  }

  revalidateInstockShopPaths();

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

interface UpdateInstockGroupInput {
  name: string;
  price: number;
  imageUrls: string[];
  tags: string[];
}

async function replaceInstockGroupImages(
  supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>,
  groupId: string,
  imageUrls: string[]
) {
  await supabase.from("instock_product_group_images").delete().eq("instock_product_group_id", groupId);
  if (imageUrls.length > 0) {
    await supabase.from("instock_product_group_images").insert(
      imageUrls.map((url, index) => ({
        instock_product_group_id: groupId,
        image_url: url,
        sort_order: index,
      }))
    );
  }
}

export async function updateInstockGroup(groupId: string, input: UpdateInstockGroupInput): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };
  if (!input.name.trim()) return { success: false, message: "請輸入品項名稱" };

  const { error } = await supabase
    .from("instock_product_groups")
    .update({
      name: input.name.trim(),
      price: input.price,
      image_url: input.imageUrls[0] ?? null,
      tags: input.tags,
    })
    .eq("id", groupId);

  if (error) return { success: false, message: error.message };

  await replaceInstockGroupImages(supabase, groupId, input.imageUrls);

  revalidateInstockShopPaths();
  return { success: true, message: "已更新品項" };
}

export async function archiveInstockGroup(groupId: string): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { error } = await supabase.from("instock_product_groups").update({ is_archived: true }).eq("id", groupId);
  if (error) return { success: false, message: error.message };

  revalidateInstockShopPaths();
  return { success: true, message: "已封存品項" };
}

export async function addInstockVariant(groupId: string, name: string, stock: number): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };
  const trimmed = name.trim();
  if (!trimmed) return { success: false, message: "請輸入細項名稱" };

  const { data: topVariant } = await supabase
    .from("instock_product_variants")
    .select("sort_order")
    .eq("instock_product_group_id", groupId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("instock_product_variants").insert({
    instock_product_group_id: groupId,
    name: trimmed,
    stock_quantity: stock,
    is_sold_out: stock <= 0,
    sort_order: (topVariant?.sort_order ?? -1) + 1,
  });

  if (error) return { success: false, message: error.message };

  revalidateInstockShopPaths();
  return { success: true, message: "已新增細項" };
}

export async function renameInstockVariant(variantId: string, name: string): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };
  const trimmed = name.trim();
  if (!trimmed) return { success: false, message: "請輸入細項名稱" };

  const { error } = await supabase.from("instock_product_variants").update({ name: trimmed }).eq("id", variantId);
  if (error) return { success: false, message: error.message };

  revalidateInstockShopPaths();
  return { success: true, message: "已更新細項" };
}

export async function toggleInstockVariantActive(variantId: string, isActive: boolean): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { error } = await supabase.from("instock_product_variants").update({ is_active: isActive }).eq("id", variantId);
  if (error) return { success: false, message: error.message };

  revalidateInstockShopPaths();
  return { success: true, message: isActive ? "已上架細項" : "已下架細項" };
}

export async function updateInstockVariantStock(variantId: string, stock: number): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { error } = await supabase
    .from("instock_product_variants")
    .update({ stock_quantity: stock, is_sold_out: stock <= 0 })
    .eq("id", variantId);

  if (error) return { success: false, message: error.message };

  revalidateInstockShopPaths();
  return { success: true, message: "庫存已更新" };
}

// 現貨盲抽/滿抽選品，跟預購（teacher-shop.ts 的 setBlindDrawConfig）邏輯完全對應。
export async function setInstockBlindDrawConfig(
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
    .from("instock_product_groups")
    .update({
      is_blind_draw: input.isBlindDraw,
      blind_draw_threshold_qty: input.isBlindDraw ? input.thresholdQty : null,
      blind_draw_pick_qty: input.isBlindDraw ? input.pickQty : null,
    })
    .eq("id", groupId);

  if (error) return { success: false, message: error.message };

  revalidateInstockShopPaths();
  return { success: true, message: input.isBlindDraw ? "已設定盲抽" : "已關閉盲抽" };
}

export async function toggleInstockGroupCpSpoiler(groupId: string, isCpSpoiler: boolean): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { error } = await supabase
    .from("instock_product_groups")
    .update({ is_cp_spoiler: isCpSpoiler })
    .eq("id", groupId);
  if (error) return { success: false, message: error.message };

  revalidateInstockShopPaths();
  return { success: true, message: isCpSpoiler ? "已開啟 CP 防雷" : "已關閉 CP 防雷" };
}

export async function toggleInstockVariantBonusOption(
  variantId: string,
  isBonusOption: boolean
): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { error } = await supabase
    .from("instock_product_variants")
    .update({ is_bonus_option: isBonusOption })
    .eq("id", variantId);
  if (error) return { success: false, message: error.message };

  revalidateInstockShopPaths();
  return { success: true, message: isBonusOption ? "已設為可選保底" : "已取消可選保底" };
}

export interface InstockBlindDrawGroupConfig {
  groupId: string;
  thresholdQty: number;
  pickQty: number;
  options: { variantId: string; variantName: string; stockQuantity: number }[];
}

// 給現貨購物車頁用：查詢購物車裡有哪些品項開啟了盲抽，以及各自的門檻/可選數量/可選細項清單
// （含庫存，因為現貨保底細項也要管理庫存，跟預購不同）。
export async function getInstockBlindDrawOptionsForGroups(
  groupIds: string[]
): Promise<InstockBlindDrawGroupConfig[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase || groupIds.length === 0) return [];

  const { data: groups } = await supabase
    .from("instock_product_groups")
    .select("id, blind_draw_threshold_qty, blind_draw_pick_qty")
    .in("id", groupIds)
    .eq("is_blind_draw", true);

  const blindDrawGroups = groups ?? [];
  if (blindDrawGroups.length === 0) return [];

  const blindDrawGroupIds = blindDrawGroups.map((g) => g.id);
  const { data: variants } = await supabase
    .from("instock_product_variants")
    .select("id, instock_product_group_id, name, stock_quantity")
    .in("instock_product_group_id", blindDrawGroupIds)
    .eq("is_bonus_option", true)
    .eq("is_active", true);

  const optionsByGroup = new Map<
    string,
    { variantId: string; variantName: string; stockQuantity: number }[]
  >();
  for (const v of variants ?? []) {
    const list = optionsByGroup.get(v.instock_product_group_id) ?? [];
    list.push({ variantId: v.id, variantName: v.name, stockQuantity: v.stock_quantity });
    optionsByGroup.set(v.instock_product_group_id, list);
  }

  return blindDrawGroups
    .filter((g) => g.blind_draw_threshold_qty && g.blind_draw_pick_qty)
    .map((g) => ({
      groupId: g.id,
      thresholdQty: g.blind_draw_threshold_qty!,
      pickQty: g.blind_draw_pick_qty!,
      options: optionsByGroup.get(g.id) ?? [],
    }));
}
