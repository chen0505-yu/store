import { cookies } from "next/headers";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const MEMBER_SESSION_COOKIE = "litan_member_session";

export interface CurrentMember {
  id: string;
  phone: string;
  fbName: string;
  fbProfileUrl: string | null;
  isBlacklisted: boolean;
}

// 從 session cookie 換回目前登入的會員。只能在 Server Component / Server Action
// 內呼叫；找不到 cookie、session 過期、或 Supabase 未設定時一律回傳 null（視為未登入）。
export async function getCurrentMember(): Promise<CurrentMember | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const store = await cookies();
  const token = store.get(MEMBER_SESSION_COOKIE)?.value;
  if (!token) return null;

  const { data: session } = await supabase
    .from("member_sessions")
    .select("member_id, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (!session || new Date(session.expires_at).getTime() < Date.now()) return null;

  const { data: member } = await supabase
    .from("members")
    .select("id, phone, fb_name, fb_profile_url, is_blacklisted")
    .eq("id", session.member_id)
    .maybeSingle();

  if (!member) return null;

  return {
    id: member.id,
    phone: member.phone,
    fbName: member.fb_name,
    fbProfileUrl: member.fb_profile_url,
    isBlacklisted: member.is_blacklisted,
  };
}
