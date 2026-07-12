import { cookies } from "next/headers";
import { getPosSupabaseServerClient as getSupabaseServerClient } from "@/lib/supabase/pos-server";
import type { PosStaffRole } from "@/lib/pos-roles";

// 角色型別/純權限判斷函式實際定義在 pos-roles.ts（不依賴 next/headers，Client
// Component 也能安全 import）。這裡重新 export 出去，Server Component / Server
// Action 沿用 "@/lib/pos-auth" 這個既有路徑就好，不用全部改 import 路徑。
export type { PosStaffRole } from "@/lib/pos-roles";
export { canManageAllData, canAccessPosAdmin, canManageStaffTarget } from "@/lib/pos-roles";

export const STAFF_SESSION_COOKIE = "litan_pos_staff_session";

export interface CurrentStaff {
  id: string;
  username: string;
  displayName: string;
  role: PosStaffRole;
}

// 從 session cookie 換回目前登入的 POS 員工。只能在 Server Component / Server Action
// 內呼叫；找不到 cookie、session 過期、帳號被停用、或 Supabase 未設定時一律回傳 null（視為未登入）。
export async function getCurrentStaff(): Promise<CurrentStaff | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const store = await cookies();
  const token = store.get(STAFF_SESSION_COOKIE)?.value;
  if (!token) return null;

  const { data: session } = await supabase
    .from("pos_staff_sessions")
    .select("staff_id, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (!session || new Date(session.expires_at).getTime() < Date.now()) return null;

  const { data: staff } = await supabase
    .from("pos_staff")
    .select("id, username, display_name, role, is_active")
    .eq("id", session.staff_id)
    .maybeSingle();

  if (!staff || !staff.is_active) return null;

  return {
    id: staff.id,
    username: staff.username,
    displayName: staff.display_name,
    role: staff.role as PosStaffRole,
  };
}
