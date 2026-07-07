import { getSupabaseServerClient } from "@/lib/supabase/server";

export interface AdminMember {
  id: string;
  phone: string;
  fbName: string;
  fbProfileUrl: string | null;
  isBlacklisted: boolean;
  blacklistReason: string | null;
  createdAt: string;
}

// 黑名單刻意保持簡單：只有是否黑名單 + 一個原因/備註欄位，沒有加入/解除日期或建立人，
// 因為黑名單基本上不會解除。
export async function getAllMembers(): Promise<AdminMember[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("members")
    .select("id, phone, fb_name, fb_profile_url, is_blacklisted, blacklist_reason, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[LITAN] 讀取會員失敗", error.message);
    return [];
  }

  return (data ?? []).map((m) => ({
    id: m.id,
    phone: m.phone,
    fbName: m.fb_name,
    fbProfileUrl: m.fb_profile_url,
    isBlacklisted: m.is_blacklisted,
    blacklistReason: m.blacklist_reason,
    createdAt: m.created_at,
  }));
}
