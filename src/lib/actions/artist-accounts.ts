"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { getUniqueTeacherCode } from "@/lib/teacher-code";

export interface ActionResult {
  success: boolean;
  message: string;
}

// 繪師帳號管理只有 super_admin 能操作：建立帳號、重設密碼、啟用/停用、審核。
// 每一支 action 都自己重新驗證目前登入身分，不能只靠前端不顯示按鈕擋掉。
async function requireSuperAdmin() {
  const admin = await getCurrentAdmin();
  if (!admin || admin.role !== "super_admin") {
    return null;
  }
  return admin;
}

// 建立繪師帳號：同時建立一間新的商店（teachers row，is_artist_shop=true）並產生
// Teacher ID 短碼，再建立對應的 admin_users row（role='artist'）連結過去。
export async function createArtistAccount(
  username: string,
  password: string,
  displayName: string,
  shopName: string
): Promise<ActionResult> {
  const admin = await requireSuperAdmin();
  if (!admin) return { success: false, message: "沒有權限執行此操作" };

  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const trimmedUsername = username.trim();
  const trimmedDisplayName = displayName.trim();
  const trimmedShopName = shopName.trim();
  if (!trimmedUsername || !password || !trimmedDisplayName || !trimmedShopName) {
    return { success: false, message: "請輸入帳號、密碼、顯示名稱與商店名稱" };
  }
  if (password.length < 8) {
    return { success: false, message: "密碼至少需要 8 碼" };
  }

  const { data: existing } = await supabase
    .from("admin_users")
    .select("id")
    .eq("username", trimmedUsername)
    .maybeSingle();
  if (existing) {
    return { success: false, message: "這個帳號已經被使用了" };
  }

  const teacherCode = await getUniqueTeacherCode(supabase);
  const { data: teacher, error: teacherError } = await supabase
    .from("teachers")
    .insert({
      teacher_code: teacherCode,
      name: trimmedShopName,
      is_artist_shop: true,
      is_active: true,
    })
    .select("id")
    .single();

  if (teacherError || !teacher) {
    return { success: false, message: teacherError?.message ?? "建立商店失敗" };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const { error: adminError } = await supabase.from("admin_users").insert({
    username: trimmedUsername,
    password_hash: passwordHash,
    display_name: trimmedDisplayName,
    role: "artist",
    teacher_id: teacher.id,
  });

  if (adminError) {
    // 帳號建立失敗就把剛建立的商店一併清掉，避免留下孤兒 teachers row。
    await supabase.from("teachers").delete().eq("id", teacher.id);
    return { success: false, message: adminError.message };
  }

  revalidatePath("/admin/artists");
  return { success: true, message: `已建立繪師帳號，Teacher ID：${teacherCode}` };
}

export async function resetArtistPassword(adminId: string, newPassword: string): Promise<ActionResult> {
  const admin = await requireSuperAdmin();
  if (!admin) return { success: false, message: "沒有權限執行此操作" };
  if (newPassword.length < 8) return { success: false, message: "密碼至少需要 8 碼" };

  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const passwordHash = await bcrypt.hash(newPassword, 10);
  const { error } = await supabase
    .from("admin_users")
    .update({ password_hash: passwordHash })
    .eq("id", adminId)
    .eq("role", "artist");

  if (error) return { success: false, message: error.message };

  // 重設密碼後把這個帳號現有的 session 全部清掉，強制用新密碼重新登入。
  await supabase.from("admin_sessions").delete().eq("admin_id", adminId);

  revalidatePath("/admin/artists");
  return { success: true, message: "已重設密碼" };
}

export async function setArtistActive(adminId: string, isActive: boolean): Promise<ActionResult> {
  const admin = await requireSuperAdmin();
  if (!admin) return { success: false, message: "沒有權限執行此操作" };

  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { error } = await supabase
    .from("admin_users")
    .update({ is_active: isActive })
    .eq("id", adminId)
    .eq("role", "artist");

  if (error) return { success: false, message: error.message };

  if (!isActive) {
    // 停用帳號時順便把現有 session 清掉，避免已登入的分頁繼續使用。
    await supabase.from("admin_sessions").delete().eq("admin_id", adminId);
  }

  revalidatePath("/admin/artists");
  return { success: true, message: isActive ? "已啟用帳號" : "已停用帳號" };
}
