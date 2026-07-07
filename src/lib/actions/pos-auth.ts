"use server";

import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { getPosSupabaseServerClient as getSupabaseServerClient } from "@/lib/supabase/pos-server";
import { STAFF_SESSION_COOKIE } from "@/lib/pos-auth";

export interface PosAuthResult {
  success: boolean;
  message: string;
}

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24; // POS 現場帳號，session 一天過期即可

export async function loginStaff(username: string, password: string): Promise<PosAuthResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const trimmedUsername = username.trim();
  if (!trimmedUsername || !password) {
    return { success: false, message: "請輸入帳號與密碼" };
  }

  const { data: staff } = await supabase
    .from("pos_staff")
    .select("id, password_hash, is_active")
    .eq("username", trimmedUsername)
    .maybeSingle();

  if (!staff || !staff.is_active) {
    return { success: false, message: "帳號或密碼錯誤" };
  }

  const passwordMatches = await bcrypt.compare(password, staff.password_hash);
  if (!passwordMatches) {
    return { success: false, message: "帳號或密碼錯誤" };
  }

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();

  const { error } = await supabase.from("pos_staff_sessions").insert({
    staff_id: staff.id,
    token,
    expires_at: expiresAt,
  });
  if (error) return { success: false, message: error.message };

  const store = await cookies();
  store.set(STAFF_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });

  return { success: true, message: "登入成功" };
}

export async function logoutStaff(): Promise<PosAuthResult> {
  const supabase = getSupabaseServerClient();
  const store = await cookies();
  const token = store.get(STAFF_SESSION_COOKIE)?.value;

  if (supabase && token) {
    await supabase.from("pos_staff_sessions").delete().eq("token", token);
  }
  store.delete(STAFF_SESSION_COOKIE);

  return { success: true, message: "已登出" };
}
