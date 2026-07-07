"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export interface ActionResult {
  success: boolean;
  message: string;
}

// 黑名單基本上不會解除，這裡刻意只提供「加入黑名單」，不提供解除流程。
export async function addMemberToBlacklist(memberId: string, reason: string): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { error } = await supabase
    .from("members")
    .update({
      is_blacklisted: true,
      blacklist_reason: reason.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", memberId);

  if (error) return { success: false, message: error.message };

  revalidatePath("/admin/members");
  return { success: true, message: "已加入黑名單" };
}
