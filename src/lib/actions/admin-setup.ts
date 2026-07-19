"use server";

import bcrypt from "bcryptjs";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export interface ActionResult {
  success: boolean;
  message: string;
}

// 建立第一個後台管理員帳號：只在開發環境可用，且只有在 admin_users 一筆都沒有時才能建立，
// 避免這支動作被當成後門拿來一直新增管理員帳號。正式環境要新增管理員，
// 請用已登入的管理員帳號在後台操作（或直接在 Supabase 後台以 SQL 建立）。
export async function createFirstAdmin(
  username: string,
  password: string,
  displayName: string
): Promise<ActionResult> {
  if (process.env.NODE_ENV !== "development") {
    return { success: false, message: "僅開發環境可執行此操作" };
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const trimmedUsername = username.trim();
  const trimmedDisplayName = displayName.trim();
  if (!trimmedUsername || !password || !trimmedDisplayName) {
    return { success: false, message: "請輸入帳號、密碼與顯示名稱" };
  }
  if (password.length < 8) {
    return { success: false, message: "密碼至少需要 8 碼" };
  }

  const { count } = await supabase.from("admin_users").select("id", { count: "exact", head: true });
  if (count && count > 0) {
    return { success: false, message: "已經有管理員帳號了，請直接用該帳號登入，或請現有管理員新增帳號" };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const { error } = await supabase.from("admin_users").insert({
    username: trimmedUsername,
    password_hash: passwordHash,
    display_name: trimmedDisplayName,
    role: "super_admin",
  });

  if (error) return { success: false, message: error.message };

  return { success: true, message: "已建立第一個管理員帳號，請到 /admin/login 登入" };
}
