"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { getPosSupabaseServerClient as getSupabaseServerClient } from "@/lib/supabase/pos-server";
import { getCurrentStaff, canAccessPosAdmin, canManageStaffTarget, type PosStaffRole } from "@/lib/pos-auth";
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
  if (!canManageStaffTarget(staff.role, input.role)) {
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

// 對現有帳號做任何操作（停用/啟用、重設密碼、刪除）之前，先查出對象目前的角色，
// 用 canManageStaffTarget 擋下「副管理員動 super_admin 帳號」這類操作。
async function getTargetRole(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  id: string
): Promise<PosStaffRole | null> {
  if (!supabase) return null;
  const { data } = await supabase.from("pos_staff").select("role").eq("id", id).maybeSingle();
  return (data?.role as PosStaffRole) ?? null;
}

export async function setStaffActive(id: string, isActive: boolean): Promise<PosActionResult> {
  const staff = await getCurrentStaff();
  if (!staff || !canAccessPosAdmin(staff.role)) return { success: false, message: "沒有權限" };

  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const targetRole = await getTargetRole(supabase, id);
  if (!targetRole || !canManageStaffTarget(staff.role, targetRole)) return { success: false, message: "沒有權限" };

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

  const targetRole = await getTargetRole(supabase, id);
  if (!targetRole || !canManageStaffTarget(staff.role, targetRole)) return { success: false, message: "沒有權限" };

  const passwordHash = await bcrypt.hash(newPassword, 10);
  const { error } = await supabase.from("pos_staff").update({ password_hash: passwordHash }).eq("id", id);
  if (error) return { success: false, message: error.message };

  return { success: true, message: "密碼已重設成功" };
}

// 修改自己的密碼：任何已登入角色都可以用，不用找 super_admin 幫忙重設。
// 一定要先驗證「目前密碼」才能改，避免有人用別人忘記登出的瀏覽器亂改密碼。
export async function changeOwnPassword(currentPassword: string, newPassword: string): Promise<PosActionResult> {
  const staff = await getCurrentStaff();
  if (!staff) return { success: false, message: "請重新登入" };
  if (!newPassword || newPassword.length < 6) return { success: false, message: "新密碼至少需要 6 碼" };

  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { data: row } = await supabase.from("pos_staff").select("password_hash").eq("id", staff.id).maybeSingle();
  if (!row) return { success: false, message: "找不到帳號" };

  const matches = await bcrypt.compare(currentPassword, row.password_hash);
  if (!matches) return { success: false, message: "目前密碼不正確" };

  const passwordHash = await bcrypt.hash(newPassword, 10);
  const { error } = await supabase.from("pos_staff").update({ password_hash: passwordHash }).eq("id", staff.id);
  if (error) return { success: false, message: error.message };

  return { success: true, message: "密碼已修改成功" };
}

// 刪除員工帳號：super_admin 可以刪除任何人；sub_admin 可以刪除 sub_admin/staff 帳號，
// 但不能刪除 super_admin 帳號（見 canManageStaffTarget）。
export async function deleteStaffAccount(id: string): Promise<PosActionResult> {
  const staff = await getCurrentStaff();
  if (!staff || !canAccessPosAdmin(staff.role)) return { success: false, message: "沒有權限" };

  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const targetRole = await getTargetRole(supabase, id);
  if (!targetRole || !canManageStaffTarget(staff.role, targetRole)) return { success: false, message: "沒有權限" };

  const { error } = await supabase.from("pos_staff").delete().eq("id", id);
  if (error) return { success: false, message: error.message };

  revalidateStaffAdmin();
  return { success: true, message: "已刪除帳號" };
}
