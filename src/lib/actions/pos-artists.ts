"use server";

import { revalidatePath } from "next/cache";
import { getPosSupabaseServerClient as getSupabaseServerClient } from "@/lib/supabase/pos-server";
import { getCurrentStaff, canAccessPosAdmin, canManageAllData } from "@/lib/pos-auth";
import { getUniqueArtistCode } from "@/lib/pos-artist-code";
import type { PosActionResult } from "@/lib/pos-types";

function revalidatePosAdmin() {
  revalidatePath("/pos/admin/artists");
  revalidatePath("/pos", "layout");
}

export interface PosArtistInput {
  eventId: string;
  name: string;
}

export async function createPosArtist(input: PosArtistInput): Promise<PosActionResult> {
  const staff = await getCurrentStaff();
  if (!staff || !canAccessPosAdmin(staff.role)) return { success: false, message: "沒有權限" };

  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };
  if (!input.name.trim()) return { success: false, message: "請輸入繪師名稱" };
  if (!input.eventId) return { success: false, message: "請選擇活動" };

  const { data: top } = await supabase
    .from("pos_artists")
    .select("sort_order")
    .eq("event_id", input.eventId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const artistCode = await getUniqueArtistCode(supabase);

  const { error } = await supabase.from("pos_artists").insert({
    event_id: input.eventId,
    name: input.name.trim(),
    artist_code: artistCode,
    sort_order: (top?.sort_order ?? -1) + 1,
  });
  if (error) return { success: false, message: error.message };

  revalidatePosAdmin();
  return { success: true, message: "已新增繪師" };
}

export async function updatePosArtist(id: string, input: PosArtistInput): Promise<PosActionResult> {
  const staff = await getCurrentStaff();
  if (!staff || !canAccessPosAdmin(staff.role)) return { success: false, message: "沒有權限" };

  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };
  if (!input.name.trim()) return { success: false, message: "請輸入繪師名稱" };

  const { error } = await supabase
    .from("pos_artists")
    .update({
      name: input.name.trim(),
      event_id: input.eventId,
    })
    .eq("id", id);
  if (error) return { success: false, message: error.message };

  revalidatePosAdmin();
  return { success: true, message: "已更新繪師資料" };
}

export async function setPosArtistActive(id: string, isActive: boolean): Promise<PosActionResult> {
  const staff = await getCurrentStaff();
  if (!staff || !canAccessPosAdmin(staff.role)) return { success: false, message: "沒有權限" };

  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { error } = await supabase.from("pos_artists").update({ is_active: isActive }).eq("id", id);
  if (error) return { success: false, message: error.message };

  revalidatePosAdmin();
  return { success: true, message: isActive ? "已啟用繪師" : "已停用繪師" };
}

// 繪師如果已經有訂單，直接刪除會撞到 pos_orders_artist_id_fkey（訂單不能失去繪師）。
// 這種情況改成「封存」（is_active = false）：POS 前台跟商品管理都會照現有的
// is_active 篩選自動隱藏，但歷史訂單/報表不受影響，仍然查得到。完全沒有訂單的
// 繪師才會真的刪除。
export async function deletePosArtist(id: string): Promise<PosActionResult> {
  const staff = await getCurrentStaff();
  if (!staff || !canManageAllData(staff.role)) return { success: false, message: "沒有權限" };

  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { count, error: countError } = await supabase
    .from("pos_orders")
    .select("id", { count: "exact", head: true })
    .eq("artist_id", id);
  if (countError) return { success: false, message: countError.message };

  if (count && count > 0) {
    const { error } = await supabase.from("pos_artists").update({ is_active: false }).eq("id", id);
    if (error) return { success: false, message: error.message };

    revalidatePosAdmin();
    return {
      success: true,
      message: "這位繪師已有歷史訂單，改為封存（不會出現在 POS 前台與商品管理，但訂單/報表仍可查詢）",
    };
  }

  const { error } = await supabase.from("pos_artists").delete().eq("id", id);
  if (error) return { success: false, message: error.message };

  revalidatePosAdmin();
  return { success: true, message: "已刪除繪師" };
}
