import { getPosSupabaseServerClient as getSupabaseServerClient } from "@/lib/supabase/pos-server";
import type { PosStaffRole } from "@/lib/pos-auth";

export interface PosStaffAccount {
  id: string;
  username: string;
  displayName: string;
  role: PosStaffRole;
  isActive: boolean;
  createdAt: string;
}

interface PosStaffRow {
  id: string;
  username: string;
  display_name: string;
  role: PosStaffRole;
  is_active: boolean;
  created_at: string;
}

export async function getAllStaffAccounts(): Promise<PosStaffAccount[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("pos_staff")
    .select("id, username, display_name, role, is_active, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[LITAN POS] 讀取員工帳號失敗", error.message);
    return [];
  }

  return ((data ?? []) as PosStaffRow[]).map((row) => ({
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    isActive: row.is_active,
    createdAt: row.created_at,
  }));
}
