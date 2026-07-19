import { cookies } from "next/headers";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const ADMIN_SESSION_COOKIE = "litan_admin_session";

export type AdminRole = "super_admin" | "artist";

export interface CurrentAdmin {
  id: string;
  username: string;
  displayName: string;
  role: AdminRole;
  // 只有 role === "artist" 才會有值，代表這個帳號對應哪一間繪師商店（teachers row）。
  teacherId: string | null;
}

// 從 session cookie 換回目前登入的後台管理員。只能在 Server Component / Server Action
// 內呼叫；找不到 cookie、session 過期、帳號被停用、或 Supabase 未設定時一律回傳 null（視為未登入）。
export async function getCurrentAdmin(): Promise<CurrentAdmin | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const store = await cookies();
  const token = store.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;

  const { data: session } = await supabase
    .from("admin_sessions")
    .select("admin_id, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (!session || new Date(session.expires_at).getTime() < Date.now()) return null;

  const { data: admin } = await supabase
    .from("admin_users")
    .select("id, username, display_name, role, teacher_id, is_active")
    .eq("id", session.admin_id)
    .maybeSingle();

  if (!admin || !admin.is_active) return null;

  return {
    id: admin.id,
    username: admin.username,
    displayName: admin.display_name,
    role: admin.role as AdminRole,
    teacherId: admin.teacher_id,
  };
}
