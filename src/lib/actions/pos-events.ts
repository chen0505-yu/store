"use server";

import { revalidatePath } from "next/cache";
import { getPosSupabaseServerClient as getSupabaseServerClient } from "@/lib/supabase/pos-server";
import { getCurrentStaff, canAccessPosAdmin, canManageAllData } from "@/lib/pos-auth";
import type { PosActionResult } from "@/lib/pos-types";

function revalidatePosAdmin() {
  revalidatePath("/pos/admin/events");
  revalidatePath("/pos", "layout");
}

export interface PosEventInput {
  name: string;
  eventDate: string | null;
  dayLabel: string | null;
  boothNumber: string | null;
}

export async function createPosEvent(input: PosEventInput): Promise<PosActionResult> {
  const staff = await getCurrentStaff();
  if (!staff || !canAccessPosAdmin(staff.role)) return { success: false, message: "沒有權限" };

  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };
  if (!input.name.trim()) return { success: false, message: "請輸入活動名稱" };

  const { data: top } = await supabase
    .from("pos_events")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("pos_events").insert({
    name: input.name.trim(),
    event_date: input.eventDate || null,
    day_label: input.dayLabel?.trim() || null,
    booth_number: input.boothNumber?.trim() || null,
    sort_order: (top?.sort_order ?? -1) + 1,
  });
  if (error) return { success: false, message: error.message };

  revalidatePosAdmin();
  return { success: true, message: "已新增活動" };
}

export async function updatePosEvent(id: string, input: PosEventInput): Promise<PosActionResult> {
  const staff = await getCurrentStaff();
  if (!staff || !canAccessPosAdmin(staff.role)) return { success: false, message: "沒有權限" };

  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };
  if (!input.name.trim()) return { success: false, message: "請輸入活動名稱" };

  const { error } = await supabase
    .from("pos_events")
    .update({
      name: input.name.trim(),
      event_date: input.eventDate || null,
      day_label: input.dayLabel?.trim() || null,
      booth_number: input.boothNumber?.trim() || null,
    })
    .eq("id", id);
  if (error) return { success: false, message: error.message };

  revalidatePosAdmin();
  return { success: true, message: "已更新活動" };
}

// 現場心智模型是「同時只有一個目前活動」：設成目前活動時，透過 pos_set_event_active()
// 順便把其他活動都設回非目前活動；關閉目前活動則單純更新這一列，不影響其他活動。
export async function setPosEventActive(id: string, isActive: boolean): Promise<PosActionResult> {
  const staff = await getCurrentStaff();
  if (!staff || !canAccessPosAdmin(staff.role)) return { success: false, message: "沒有權限" };

  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  if (isActive) {
    const { error } = await supabase.rpc("pos_set_event_active", { p_event_id: id });
    if (error) return { success: false, message: error.message };
  } else {
    const { error } = await supabase.from("pos_events").update({ is_active: false }).eq("id", id);
    if (error) return { success: false, message: error.message };
  }

  revalidatePosAdmin();
  return { success: true, message: isActive ? "已設為目前活動" : "已停用活動" };
}

// 刪除活動＝整場活動的資料全部永久清空（活動、繪師、商品、訂單、贈品、庫存），
// 符合現場「結束活動 → Excel 匯出備份 → 整場清空 → 建立下一場」的流程，不保留歷史。
// 屬於「刪除全部資料」層級操作，只有超級管理員可以執行；單一 RPC 交易完成，
// 見 supabase/migrations/029_pos_event_cascade_delete.sql。
export async function deletePosEvent(id: string): Promise<PosActionResult> {
  const staff = await getCurrentStaff();
  if (!staff || !canManageAllData(staff.role)) return { success: false, message: "沒有權限" };

  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { error } = await supabase.rpc("pos_delete_event_cascade", { p_event_id: id });
  if (error) return { success: false, message: error.message };

  revalidatePosAdmin();
  revalidatePath("/pos/admin/artists");
  revalidatePath("/pos/admin/products");
  revalidatePath("/pos/admin/freebies");
  revalidatePath("/pos/admin/orders");
  revalidatePath("/pos/admin/settlement");
  revalidatePath("/pos/admin/stats");
  revalidatePath("/pos/admin/reports");
  return { success: true, message: "已永久刪除這場活動的所有資料" };
}
