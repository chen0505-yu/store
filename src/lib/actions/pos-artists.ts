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

export async function deletePosArtist(id: string): Promise<PosActionResult> {
  const staff = await getCurrentStaff();
  if (!staff || !canManageAllData(staff.role)) return { success: false, message: "沒有權限" };

  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { error } = await supabase.from("pos_artists").delete().eq("id", id);
  if (error) return { success: false, message: error.message };

  revalidatePosAdmin();
  return { success: true, message: "已刪除繪師" };
}
