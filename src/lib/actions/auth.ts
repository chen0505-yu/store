"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { MEMBER_SESSION_COOKIE } from "@/lib/auth";
import { isFacebookProfileUrl } from "@/lib/validation";

export interface AuthResult {
  success: boolean;
  message: string;
}

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 天

async function createSession(supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>, memberId: string) {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();

  const { error } = await supabase.from("member_sessions").insert({
    member_id: memberId,
    token,
    expires_at: expiresAt,
  });
  if (error) throw new Error(error.message);

  const store = await cookies();
  store.set(MEMBER_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
}

export interface RegisterInput {
  fbName: string;
  fbProfileUrl: string;
  phone: string;
  password: string;
}

// 註冊欄位：FB 名字、FB 個人頁面連結、手機號碼、密碼。不使用簡訊驗證/OTP/第三方付費驗證。
export async function registerMember(input: RegisterInput): Promise<AuthResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const fbName = input.fbName.trim();
  const fbProfileUrl = input.fbProfileUrl.trim();
  const phone = input.phone.trim();

  if (!fbName) return { success: false, message: "請輸入 FB 名字" };
  if (!fbProfileUrl) return { success: false, message: "請輸入 FB 個人頁面連結" };
  if (!isFacebookProfileUrl(fbProfileUrl)) {
    return { success: false, message: "FB 個人頁面連結必須是 facebook.com 網址" };
  }
  if (!phone) return { success: false, message: "請輸入手機號碼" };
  if (!input.password) return { success: false, message: "請輸入密碼" };
  if (input.password.length < 6) return { success: false, message: "密碼至少需要 6 碼" };

  const { data: existing } = await supabase
    .from("members")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();

  if (existing) {
    return { success: false, message: "這個手機號碼已經註冊過了" };
  }

  const passwordHash = await bcrypt.hash(input.password, 10);

  const { data: member, error } = await supabase
    .from("members")
    .insert({
      phone,
      password_hash: passwordHash,
      fb_name: fbName,
      fb_profile_url: fbProfileUrl,
    })
    .select("id")
    .single();

  if (error || !member) {
    return { success: false, message: error?.message ?? "註冊失敗" };
  }

  await createSession(supabase, member.id);
  revalidatePath("/member");
  return { success: true, message: "註冊成功" };
}

export interface LoginInput {
  phone: string;
  password: string;
}

export async function loginMember(input: LoginInput): Promise<AuthResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const phone = input.phone.trim();
  if (!phone || !input.password) {
    return { success: false, message: "請輸入手機號碼與密碼" };
  }

  const { data: member } = await supabase
    .from("members")
    .select("id, password_hash")
    .eq("phone", phone)
    .maybeSingle();

  if (!member) {
    return { success: false, message: "手機號碼或密碼錯誤" };
  }

  const passwordMatches = await bcrypt.compare(input.password, member.password_hash);
  if (!passwordMatches) {
    return { success: false, message: "手機號碼或密碼錯誤" };
  }

  await createSession(supabase, member.id);
  revalidatePath("/member");
  return { success: true, message: "登入成功" };
}

export async function logoutMember(): Promise<AuthResult> {
  const supabase = getSupabaseServerClient();
  const store = await cookies();
  const token = store.get(MEMBER_SESSION_COOKIE)?.value;

  if (supabase && token) {
    await supabase.from("member_sessions").delete().eq("token", token);
  }
  store.delete(MEMBER_SESSION_COOKIE);

  revalidatePath("/member");
  revalidatePath("/");
  return { success: true, message: "已登出" };
}
