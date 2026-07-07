"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { getPosSupabaseServerClient as getSupabaseServerClient } from "@/lib/supabase/pos-server";
import { getCurrentStaff, canAccessPosAdmin, canManageAllData, type PosStaffRole } from "@/lib/pos-auth";
import type { PosActionResult } from "@/lib/pos-types";

function revalidateStaffAdmin() {
  revalidatePath("/pos/admin/staff");
}

export interface CreateStaffInput {
  username: string;
  password: string;
  displayName: string;
  role: PosStaffRole;
}

// 副管理員可以新增員工帳號，但不能把新帳號設為 super_admin（只有超級管理員能授予最高權限）。
export async function createStaffAccount(input: CreateStaffInput): Promise<PosActionResult> {
  const staff = await getCurrentStaff();
  if (!staff || !canAccessPosAdmin(staff.role)) return { success: false, message: "沒有權限" };
  if (input.role === "super_admin" && !canManageAllData(staff.role)) {
    return { success: false, message: "只有超級管理員可以新增超級管理員帳號" };
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const username = input.username.trim();
  if (!username) return { success: false, message: "請輸入帳號" };
  if (!input.displayName.trim()) return { success: false, message: "請輸入顯示名稱" };
  if (!input.password || input.password.length < 6) return { success: false, message: "密碼至少需要 6 碼" };

  const { data: existing } = await supabase.from("pos_staff").select("id").eq("username", username).maybeSingle();
  if (existing) return { success: false, message: "這個帳號已經存在" };

  const passwordHash = await bcrypt.hash(input.password, 10);
  const { error } = await supabase.from("pos_staff").insert({
    username,
    password_hash: passwordHash,
    display_name: input.displayName.trim(),
    role: input.role,
  });
  if (error) return { success: false, message: error.message };

  revalidateStaffAdmin();
  return { success: true, message: "已新增員工帳號" };
}

export async function setStaffActive(id: string, isActive: boolean): Promise<PosActionResult> {
  const staff = await getCurrentStaff();
  if (!staff || !canAccessPosAdmin(staff.role)) return { success: false, message: "沒有權限" };

  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { error } = await supabase.from("pos_staff").update({ is_active: isActive }).eq("id", id);
  if (error) return { success: false, message: error.message };

  revalidateStaffAdmin();
  return { success: true, message: isActive ? "已啟用帳號" : "已停用帳號" };
}

export async function resetStaffPassword(id: string, newPassword: string): Promise<PosActionResult> {
  const staff = await getCurrentStaff();
  if (!staff || !canAccessPosAdmin(staff.role)) return { success: false, message: "沒有權限" };
  if (!newPassword || newPassword.length < 6) return { success: false, message: "密碼至少需要 6 碼" };

  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const passwordHash = await bcrypt.hash(newPassword, 10);
  const { error } = await supabase.from("pos_staff").update({ password_hash: passwordHash }).eq("id", id);
  if (error) return { success: false, message: error.message };

  return { success: true, message: "已重設密碼" };
}

// 刪除員工帳號屬於「刪除全部資料」層級操作，只有超級管理員可以執行。
export async function deleteStaffAccount(id: string): Promise<PosActionResult> {
  const staff = await getCurrentStaff();
  if (!staff || !canManageAllData(staff.role)) return { success: false, message: "沒有權限" };

  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { error } = await supabase.from("pos_staff").delete().eq("id", id);
  if (error) return { success: false, message: error.message };

  revalidateStaffAdmin();
  return { success: true, message: "已刪除帳號" };
}
