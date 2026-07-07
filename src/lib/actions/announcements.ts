"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { AnnouncementCategory } from "@/lib/types";

export interface ActionResult {
  success: boolean;
  message: string;
}

function revalidateAnnouncementPaths() {
  revalidatePath("/admin/announcements");
  revalidatePath("/");
}

export async function createAnnouncement(
  title: string,
  content: string,
  category: AnnouncementCategory,
  isPinned: boolean,
  isPublic: boolean
): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };
  if (!title.trim()) return { success: false, message: "請輸入標題" };

  const { error } = await supabase.from("announcements").insert({
    title: title.trim(),
    content: content.trim(),
    category,
    is_pinned: isPinned,
    is_public: isPublic,
  });

  if (error) return { success: false, message: error.message };

  revalidateAnnouncementPaths();
  return { success: true, message: "已新增公告" };
}

export async function updateAnnouncement(
  id: string,
  title: string,
  content: string,
  category: AnnouncementCategory,
  isPinned: boolean,
  isPublic: boolean
): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };
  if (!title.trim()) return { success: false, message: "請輸入標題" };

  const { error } = await supabase
    .from("announcements")
    .update({
      title: title.trim(),
      content: content.trim(),
      category,
      is_pinned: isPinned,
      is_public: isPublic,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { success: false, message: error.message };

  revalidateAnnouncementPaths();
  return { success: true, message: "已更新公告" };
}

export async function setAnnouncementArchived(id: string, isArchived: boolean): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { error } = await supabase
    .from("announcements")
    .update({ is_archived: isArchived, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { success: false, message: error.message };

  revalidateAnnouncementPaths();
  return { success: true, message: isArchived ? "已封存公告" : "已取消封存" };
}

export async function deleteAnnouncement(id: string): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { error } = await supabase.from("announcements").delete().eq("id", id);
  if (error) return { success: false, message: error.message };

  revalidateAnnouncementPaths();
  return { success: true, message: "已刪除公告" };
}
