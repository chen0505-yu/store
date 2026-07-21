"use server";

import { revalidatePath } from "next/cache";
import { getPosSupabaseServerClient as getSupabaseServerClient } from "@/lib/supabase/pos-server";
import { getCurrentStaff, canAccessPosAdmin, canManageAllData } from "@/lib/pos-auth";
import type { PosActionResult } from "@/lib/pos-types";

function revalidatePosAdmin() {
  revalidatePath("/pos/admin/artist-groups");
  revalidatePath("/pos", "layout");
}

export interface PosArtistGroupInput {
  eventId: string;
  name: string;
  memberArtistIds: string[];
}

// pos_artist_group_members 有 unique(artist_id)：一位 Artist 同時只能屬於一個共用群組。
// 寫入前先檢查有沒有人已經在「別的」群組裡，直接讓 DB 撞 unique constraint 只會丟出
// 難懂的錯誤訊息，這裡先查一次給小幫手看得懂的提示（哪位 Artist、已經在哪個群組）。
async function findConflictingMemberships(
  supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>,
  memberArtistIds: string[],
  excludeGroupId: string | null
): Promise<string | null> {
  if (memberArtistIds.length === 0) return null;

  let query = supabase
    .from("pos_artist_group_members")
    .select("artist_id, group_id, pos_artists(name), pos_artist_groups(name)")
    .in("artist_id", memberArtistIds);
  if (excludeGroupId) query = query.neq("group_id", excludeGroupId);

  const { data, error } = await query;
  if (error) return error.message;
  if (!data || data.length === 0) return null;

  const rows = data as unknown as {
    pos_artists: { name: string } | null;
    pos_artist_groups: { name: string } | null;
  }[];
  const names = rows
    .map((r) => `${r.pos_artists?.name ?? "?"}（已在「${r.pos_artist_groups?.name ?? "?"}」）`)
    .join("、");
  return `以下繪師已經屬於其他共用攤位，請先從原本的攤位移除：${names}`;
}

export async function createPosArtistGroup(input: PosArtistGroupInput): Promise<PosActionResult> {
  const staff = await getCurrentStaff();
  if (!staff || !canAccessPosAdmin(staff.role)) return { success: false, message: "沒有權限" };

  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };
  if (!input.name.trim()) return { success: false, message: "請輸入共用攤位名稱" };
  if (!input.eventId) return { success: false, message: "請選擇活動" };

  const conflict = await findConflictingMemberships(supabase, input.memberArtistIds, null);
  if (conflict) return { success: false, message: conflict };

  const { data: top } = await supabase
    .from("pos_artist_groups")
    .select("sort_order")
    .eq("event_id", input.eventId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: group, error } = await supabase
    .from("pos_artist_groups")
    .insert({ event_id: input.eventId, name: input.name.trim(), sort_order: (top?.sort_order ?? -1) + 1 })
    .select("id")
    .single();
  if (error || !group) return { success: false, message: error?.message ?? "新增共用攤位失敗" };

  if (input.memberArtistIds.length > 0) {
    const { error: memberError } = await supabase
      .from("pos_artist_group_members")
      .insert(input.memberArtistIds.map((artistId) => ({ group_id: group.id, artist_id: artistId })));
    if (memberError) return { success: false, message: memberError.message };
  }

  revalidatePosAdmin();
  return { success: true, message: "已新增共用攤位" };
}

export async function updatePosArtistGroup(id: string, input: PosArtistGroupInput): Promise<PosActionResult> {
  const staff = await getCurrentStaff();
  if (!staff || !canAccessPosAdmin(staff.role)) return { success: false, message: "沒有權限" };

  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };
  if (!input.name.trim()) return { success: false, message: "請輸入共用攤位名稱" };

  const conflict = await findConflictingMemberships(supabase, input.memberArtistIds, id);
  if (conflict) return { success: false, message: conflict };

  const { error } = await supabase.from("pos_artist_groups").update({ name: input.name.trim() }).eq("id", id);
  if (error) return { success: false, message: error.message };

  // 成員用「先刪除、整批重新寫入」模式，比照 pos-products.ts 的 variants 寫法。
  const { error: deleteError } = await supabase.from("pos_artist_group_members").delete().eq("group_id", id);
  if (deleteError) return { success: false, message: deleteError.message };

  if (input.memberArtistIds.length > 0) {
    const { error: memberError } = await supabase
      .from("pos_artist_group_members")
      .insert(input.memberArtistIds.map((artistId) => ({ group_id: id, artist_id: artistId })));
    if (memberError) return { success: false, message: memberError.message };
  }

  revalidatePosAdmin();
  return { success: true, message: "已更新共用攤位" };
}

// pos_orders.shared_group_id 是 on delete set null，刪除共用攤位不會影響任何歷史訂單
// （訂單仍然保留，只是不再連結到這個已刪除的群組），所以這裡可以直接刪除，
// 不需要比照 deletePosArtist 那種「有訂單就改成封存」的機制。
export async function deletePosArtistGroup(id: string): Promise<PosActionResult> {
  const staff = await getCurrentStaff();
  if (!staff || !canManageAllData(staff.role)) return { success: false, message: "沒有權限" };

  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { error } = await supabase.from("pos_artist_groups").delete().eq("id", id);
  if (error) return { success: false, message: error.message };

  revalidatePosAdmin();
  return { success: true, message: "已刪除共用攤位" };
}
