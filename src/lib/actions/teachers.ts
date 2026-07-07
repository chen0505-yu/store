"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export interface ActionResult {
  success: boolean;
  message: string;
}

interface TeacherInput {
  name: string;
  avatarUrl?: string;
  socialUrl?: string;
}

export async function updateTeacher(
  id: string,
  input: TeacherInput
): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };
  if (!input.name.trim()) return { success: false, message: "請輸入老師名稱" };

  const { error } = await supabase
    .from("teachers")
    .update({
      name: input.name.trim(),
      avatar_url: input.avatarUrl || null,
      social_url: input.socialUrl || null,
    })
    .eq("id", id);

  if (error) return { success: false, message: error.message };

  revalidateTeacherShopPaths();
  return { success: true, message: "已更新老師資料" };
}

function revalidateTeacherShopPaths() {
  revalidatePath("/admin/preorder-products");
  revalidatePath("/admin/instock-products");
  revalidatePath("/preorder");
  revalidatePath("/instock");
  revalidatePath("/preorder/teacher", "layout");
  revalidatePath("/instock/teacher", "layout");
}

// 老師賣場封面圖：老師層級，預購／現貨賣場共用同一組圖片。整批覆蓋寫入，
// 跟 product_group_images 一樣採「先刪除再重新寫入」，圖片數量不多，效能沒有問題。
export async function updateTeacherImages(
  teacherId: string,
  imageUrls: string[]
): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  await supabase.from("teacher_images").delete().eq("teacher_id", teacherId);
  if (imageUrls.length > 0) {
    const { error } = await supabase.from("teacher_images").insert(
      imageUrls.map((url, index) => ({
        teacher_id: teacherId,
        image_url: url,
        sort_order: index,
      }))
    );
    if (error) return { success: false, message: error.message };
  }

  revalidateTeacherShopPaths();
  return { success: true, message: "已更新老師賣場封面圖" };
}

// 活動現場取貨：開放與否設在老師層級，跟預購時間窗一樣整間賣場共用。
export async function setTeacherEventPickupEnabled(
  teacherId: string,
  enabled: boolean
): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { error } = await supabase
    .from("teachers")
    .update({ allow_event_pickup: enabled })
    .eq("id", teacherId);
  if (error) return { success: false, message: error.message };

  revalidateTeacherShopPaths();
  return { success: true, message: enabled ? "已開放現場取貨" : "已關閉現場取貨" };
}

export interface EventPickupOptionInput {
  eventName: string;
  sessionName: string;
  displayName: string;
}

export async function addEventPickupOption(
  teacherId: string,
  input: EventPickupOptionInput
): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };
  if (!input.eventName.trim()) return { success: false, message: "請輸入活動名稱" };
  if (!input.displayName.trim()) return { success: false, message: "請輸入顯示名稱" };

  const { data: top } = await supabase
    .from("event_pickup_options")
    .select("sort_order")
    .eq("teacher_id", teacherId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("event_pickup_options").insert({
    teacher_id: teacherId,
    event_name: input.eventName.trim(),
    session_name: input.sessionName.trim() || null,
    display_name: input.displayName.trim(),
    sort_order: (top?.sort_order ?? -1) + 1,
  });
  if (error) return { success: false, message: error.message };

  revalidateTeacherShopPaths();
  return { success: true, message: "已新增取貨選項" };
}

export async function toggleEventPickupOptionActive(
  optionId: string,
  isActive: boolean
): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { error } = await supabase
    .from("event_pickup_options")
    .update({ is_active: isActive })
    .eq("id", optionId);
  if (error) return { success: false, message: error.message };

  revalidateTeacherShopPaths();
  return { success: true, message: isActive ? "已啟用" : "已停用" };
}

export async function deleteEventPickupOption(optionId: string): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { error } = await supabase.from("event_pickup_options").delete().eq("id", optionId);
  if (error) return { success: false, message: error.message };

  revalidateTeacherShopPaths();
  return { success: true, message: "已刪除取貨選項" };
}

export interface TeacherEventPickupConfig {
  teacherId: string;
  teacherName: string;
  options: { id: string; displayName: string }[];
}

// 給預購購物車頁用：查詢購物車裡的老師之中，哪些有開放現場取貨，以及各自的可選場次。
export async function getEventPickupOptionsForTeachers(
  teacherIds: string[]
): Promise<TeacherEventPickupConfig[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase || teacherIds.length === 0) return [];

  const { data: teachers } = await supabase
    .from("teachers")
    .select("id, name")
    .in("id", teacherIds)
    .eq("allow_event_pickup", true);

  const enabledTeachers = teachers ?? [];
  if (enabledTeachers.length === 0) return [];

  const enabledTeacherIds = enabledTeachers.map((t) => t.id);
  const { data: options } = await supabase
    .from("event_pickup_options")
    .select("id, teacher_id, display_name")
    .in("teacher_id", enabledTeacherIds)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  const optionsByTeacher = new Map<string, { id: string; displayName: string }[]>();
  for (const o of options ?? []) {
    const list = optionsByTeacher.get(o.teacher_id) ?? [];
    list.push({ id: o.id, displayName: o.display_name });
    optionsByTeacher.set(o.teacher_id, list);
  }

  return enabledTeachers
    .map((t) => ({
      teacherId: t.id,
      teacherName: t.name,
      options: optionsByTeacher.get(t.id) ?? [],
    }))
    .filter((t) => t.options.length > 0);
}

// 給預購購物車頁用：判斷購物車裡的老師之中，哪些「有開放現場取貨」（不論目前是否有可選場次），
// 用來偵測購物車是否同時混了可現場取貨／不可現場取貨的商品，混到就要擋下結帳。
export async function getEventPickupEligibleTeacherIds(teacherIds: string[]): Promise<string[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase || teacherIds.length === 0) return [];

  const { data } = await supabase
    .from("teachers")
    .select("id")
    .in("id", teacherIds)
    .eq("allow_event_pickup", true);

  return (data ?? []).map((t) => t.id);
}
