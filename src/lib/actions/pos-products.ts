"use server";

import { revalidatePath } from "next/cache";
import { getPosSupabaseServerClient as getSupabaseServerClient } from "@/lib/supabase/pos-server";
import { getCurrentStaff, canAccessPosAdmin, canManageAllData } from "@/lib/pos-auth";
import type { PosActionResult } from "@/lib/pos-types";

function revalidatePosAdmin() {
  revalidatePath("/pos/admin/products");
  revalidatePath("/pos", "layout");
}

export interface PosProductVariantInput {
  name: string;
  stockQuantity: number;
}

export interface PosProductGroupInput {
  artistId: string;
  name: string;
  imageUrl: string | null;
  price: number;
  note: string | null;
  stockQuantity: number; // 只在 variants 為空陣列時使用
  isActive: boolean;
  variants: PosProductVariantInput[];
}

function validateGroupInput(input: PosProductGroupInput): string | null {
  if (!input.name.trim()) return "請輸入商品名稱";
  if (!input.artistId) return "請選擇繪師";
  if (input.price < 0) return "單價不可為負數";
  if (input.stockQuantity < 0) return "庫存不可為負數";
  if (input.variants.some((v) => !v.name.trim())) return "細項名稱不可為空";
  if (input.variants.some((v) => v.stockQuantity < 0)) return "細項庫存不可為負數";
  return null;
}

// 商品主項＋細項一起建立。細項用「先刪除再整批重新寫入」模式（比照
// src/lib/actions/teachers.ts 的 updateTeacherImages 寫法），細項數量不多，效能沒有問題。
export async function createPosProductGroup(input: PosProductGroupInput): Promise<PosActionResult> {
  const staff = await getCurrentStaff();
  if (!staff || !canAccessPosAdmin(staff.role)) return { success: false, message: "沒有權限" };

  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const validationError = validateGroupInput(input);
  if (validationError) return { success: false, message: validationError };

  const { data: top } = await supabase
    .from("pos_product_groups")
    .select("sort_order")
    .eq("artist_id", input.artistId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: group, error } = await supabase
    .from("pos_product_groups")
    .insert({
      artist_id: input.artistId,
      name: input.name.trim(),
      image_url: input.imageUrl || null,
      price: input.price,
      note: input.note?.trim() || null,
      stock_quantity: input.stockQuantity,
      is_active: input.isActive,
      sort_order: (top?.sort_order ?? -1) + 1,
    })
    .select("id")
    .single();

  if (error || !group) return { success: false, message: error?.message ?? "新增商品失敗" };

  if (input.variants.length > 0) {
    const { error: variantError } = await supabase.from("pos_product_variants").insert(
      input.variants.map((v, index) => ({
        group_id: group.id,
        name: v.name.trim(),
        stock_quantity: v.stockQuantity,
        sort_order: index,
      }))
    );
    if (variantError) return { success: false, message: variantError.message };
  }

  revalidatePosAdmin();
  return { success: true, message: "已新增商品" };
}

export async function updatePosProductGroup(id: string, input: PosProductGroupInput): Promise<PosActionResult> {
  const staff = await getCurrentStaff();
  if (!staff || !canAccessPosAdmin(staff.role)) return { success: false, message: "沒有權限" };

  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const validationError = validateGroupInput(input);
  if (validationError) return { success: false, message: validationError };

  const { error } = await supabase
    .from("pos_product_groups")
    .update({
      name: input.name.trim(),
      image_url: input.imageUrl || null,
      price: input.price,
      note: input.note?.trim() || null,
      stock_quantity: input.stockQuantity,
      is_active: input.isActive,
      artist_id: input.artistId,
    })
    .eq("id", id);
  if (error) return { success: false, message: error.message };

  await supabase.from("pos_product_variants").delete().eq("group_id", id);
  if (input.variants.length > 0) {
    const { error: variantError } = await supabase.from("pos_product_variants").insert(
      input.variants.map((v, index) => ({
        group_id: id,
        name: v.name.trim(),
        stock_quantity: v.stockQuantity,
        sort_order: index,
      }))
    );
    if (variantError) return { success: false, message: variantError.message };
  }

  revalidatePosAdmin();
  return { success: true, message: "已更新商品" };
}

// 商品列表的庫存快速修改用，只改庫存，不用整個表單。
export async function updatePosProductStock(id: string, stockQuantity: number): Promise<PosActionResult> {
  const staff = await getCurrentStaff();
  if (!staff || !canAccessPosAdmin(staff.role)) return { success: false, message: "沒有權限" };
  if (stockQuantity < 0) return { success: false, message: "庫存不可為負數" };

  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { error } = await supabase.from("pos_product_groups").update({ stock_quantity: stockQuantity }).eq("id", id);
  if (error) return { success: false, message: error.message };

  revalidatePosAdmin();
  return { success: true, message: "已更新庫存" };
}

// 商品拖曳排序：orderedGroupIds 是拖曳完成後由上到下的順序，依序寫入 sort_order（POS 收銀畫面
// 依這個順序顯示）。限制在同一位繪師底下操作，避免不同繪師的商品被混著排序。
export async function reorderPosProductGroups(artistId: string, orderedGroupIds: string[]): Promise<PosActionResult> {
  const staff = await getCurrentStaff();
  if (!staff || !canAccessPosAdmin(staff.role)) return { success: false, message: "沒有權限" };

  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  for (let i = 0; i < orderedGroupIds.length; i++) {
    const { error } = await supabase
      .from("pos_product_groups")
      .update({ sort_order: i })
      .eq("id", orderedGroupIds[i])
      .eq("artist_id", artistId);
    if (error) return { success: false, message: error.message };
  }

  revalidatePosAdmin();
  return { success: true, message: "已更新排序" };
}

export async function deletePosProductGroup(id: string): Promise<PosActionResult> {
  const staff = await getCurrentStaff();
  if (!staff || !canManageAllData(staff.role)) return { success: false, message: "沒有權限" };

  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { error } = await supabase.from("pos_product_groups").delete().eq("id", id);
  if (error) return { success: false, message: error.message };

  revalidatePosAdmin();
  return { success: true, message: "已刪除商品" };
}
