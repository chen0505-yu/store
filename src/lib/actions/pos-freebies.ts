"use server";

import { revalidatePath } from "next/cache";
import { getPosSupabaseServerClient as getSupabaseServerClient } from "@/lib/supabase/pos-server";
import { getCurrentStaff, canAccessPosAdmin, canManageAllData } from "@/lib/pos-auth";
import type { PosActionResult, PosFreebieRuleType } from "@/lib/pos-types";

function revalidatePosAdmin() {
  revalidatePath("/pos/admin/freebies");
  revalidatePath("/pos", "layout");
}

export interface PosFreebieOptionInput {
  name: string;
  stockQuantity: number;
}

export interface PosFreebieRuleInput {
  artistId: string;
  name: string;
  ruleType: PosFreebieRuleType;
  thresholdAmount: number | null;
  triggerGroupId: string | null;
  isStackable: boolean;
  isActive: boolean;
  options: PosFreebieOptionInput[];
}

function validateRuleInput(input: PosFreebieRuleInput): string | null {
  if (!input.name.trim()) return "請輸入規則名稱";
  if (!input.artistId) return "請選擇繪師";
  if (input.ruleType === "spend_threshold") {
    if (!input.thresholdAmount || input.thresholdAmount <= 0) return "請輸入滿額門檻金額";
  } else {
    if (!input.triggerGroupId) return "請選擇指定商品";
  }
  if (input.options.length === 0) return "請至少新增一款候選贈品";
  if (input.options.some((o) => !o.name.trim())) return "贈品名稱不可為空";
  if (input.options.some((o) => o.stockQuantity < 0)) return "贈品庫存不可為負數";
  return null;
}

// 贈品規則＋候選贈品一起建立。候選贈品用「先刪除再整批重新寫入」模式
// （比照 src/lib/actions/pos-products.ts 的 variants 寫法）。
export async function createFreebieRule(input: PosFreebieRuleInput): Promise<PosActionResult> {
  const staff = await getCurrentStaff();
  if (!staff || !canAccessPosAdmin(staff.role)) return { success: false, message: "沒有權限" };

  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const validationError = validateRuleInput(input);
  if (validationError) return { success: false, message: validationError };

  const { data: top } = await supabase
    .from("pos_freebie_rules")
    .select("sort_order")
    .eq("artist_id", input.artistId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: rule, error } = await supabase
    .from("pos_freebie_rules")
    .insert({
      artist_id: input.artistId,
      name: input.name.trim(),
      rule_type: input.ruleType,
      threshold_amount: input.ruleType === "spend_threshold" ? input.thresholdAmount : null,
      trigger_group_id: input.ruleType === "buy_product" ? input.triggerGroupId : null,
      is_stackable: input.isStackable,
      is_active: input.isActive,
      sort_order: (top?.sort_order ?? -1) + 1,
    })
    .select("id")
    .single();

  if (error || !rule) return { success: false, message: error?.message ?? "新增規則失敗" };

  const { error: optionError } = await supabase.from("pos_freebie_options").insert(
    input.options.map((o, index) => ({
      rule_id: rule.id,
      name: o.name.trim(),
      stock_quantity: o.stockQuantity,
      sort_order: index,
    }))
  );
  if (optionError) return { success: false, message: optionError.message };

  revalidatePosAdmin();
  return { success: true, message: "已新增贈品規則" };
}

export async function updateFreebieRule(id: string, input: PosFreebieRuleInput): Promise<PosActionResult> {
  const staff = await getCurrentStaff();
  if (!staff || !canAccessPosAdmin(staff.role)) return { success: false, message: "沒有權限" };

  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const validationError = validateRuleInput(input);
  if (validationError) return { success: false, message: validationError };

  const { error } = await supabase
    .from("pos_freebie_rules")
    .update({
      name: input.name.trim(),
      rule_type: input.ruleType,
      threshold_amount: input.ruleType === "spend_threshold" ? input.thresholdAmount : null,
      trigger_group_id: input.ruleType === "buy_product" ? input.triggerGroupId : null,
      is_stackable: input.isStackable,
      is_active: input.isActive,
      artist_id: input.artistId,
    })
    .eq("id", id);
  if (error) return { success: false, message: error.message };

  await supabase.from("pos_freebie_options").delete().eq("rule_id", id);
  const { error: optionError } = await supabase.from("pos_freebie_options").insert(
    input.options.map((o, index) => ({
      rule_id: id,
      name: o.name.trim(),
      stock_quantity: o.stockQuantity,
      sort_order: index,
    }))
  );
  if (optionError) return { success: false, message: optionError.message };

  revalidatePosAdmin();
  return { success: true, message: "已更新贈品規則" };
}

export async function deleteFreebieRule(id: string): Promise<PosActionResult> {
  const staff = await getCurrentStaff();
  if (!staff || !canManageAllData(staff.role)) return { success: false, message: "沒有權限" };

  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { error } = await supabase.from("pos_freebie_rules").delete().eq("id", id);
  if (error) return { success: false, message: error.message };

  revalidatePosAdmin();
  return { success: true, message: "已刪除贈品規則" };
}
