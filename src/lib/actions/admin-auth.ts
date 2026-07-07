"use server";

import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { ADMIN_SESSION_COOKIE } from "@/lib/admin-auth";

export interface AdminAuthResult {
  success: boolean;
  message: string;
}

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 後台帳號，session 維持 7 天

export async function loginAdmin(username: string, password: string): Promise<AdminAuthResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const trimmedUsername = username.trim();
  if (!trimmedUsername || !password) {
    return { success: false, message: "請輸入帳號與密碼" };
  }

  const { data: admin } = await supabase
    .from("admin_users")
    .select("id, password_hash, is_active")
    .eq("username", trimmedUsername)
    .maybeSingle();

  if (!admin || !admin.is_active) {
    return { success: false, message: "帳號或密碼錯誤" };
  }

  const passwordMatches = await bcrypt.compare(password, admin.password_hash);
  if (!passwordMatches) {
    return { success: false, message: "帳號或密碼錯誤" };
  }

  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();
  const { data: session, error } = await supabase
    .from("admin_sessions")
    .insert({ admin_id: admin.id, expires_at: expiresAt })
    .select("token")
    .single();

  if (error || !session) return { success: false, message: error?.message ?? "登入失敗" };

  const store = await cookies();
  store.set(ADMIN_SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });

  return { success: true, message: "登入成功" };
}

export async function logoutAdmin(): Promise<AdminAuthResult> {
  const supabase = getSupabaseServerClient();
  const store = await cookies();
  const token = store.get(ADMIN_SESSION_COOKIE)?.value;

  if (supabase && token) {
    await supabase.from("admin_sessions").delete().eq("token", token);
  }
  store.delete(ADMIN_SESSION_COOKIE);

  return { success: true, message: "已登出" };
}
