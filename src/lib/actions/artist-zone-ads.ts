"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentAdmin } from "@/lib/admin-auth";

export interface ActionResult {
  success: boolean;
  message: string;
}

// 繪師專區廣告只有 super_admin 能管理：圖片/標題/說明/連結/顯示隱藏/排序。
async function requireSuperAdmin() {
  const admin = await getCurrentAdmin();
  if (!admin || admin.role !== "super_admin") return null;
  return admin;
}

function revalidateAdPaths() {
  revalidatePath("/admin/artist-ads");
  revalidatePath("/artist");
}

export async function createArtistZoneAd(input: {
  imageUrl: string;
  title: string;
  description: string;
  linkUrl: string;
}): Promise<ActionResult> {
  const admin = await requireSuperAdmin();
  if (!admin) return { success: false, message: "沒有權限執行此操作" };
  if (!input.imageUrl.trim()) return { success: false, message: "請上傳廣告圖片" };

  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { data: top } = await supabase
    .from("artist_zone_ads")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("artist_zone_ads").insert({
    image_url: input.imageUrl.trim(),
    title: input.title.trim() || null,
    description: input.description.trim() || null,
    link_url: input.linkUrl.trim() || null,
    sort_order: (top?.sort_order ?? -1) + 1,
  });

  if (error) return { success: false, message: error.message };
  revalidateAdPaths();
  return { success: true, message: "已新增廣告" };
}

export async function updateArtistZoneAd(
  adId: string,
  input: { imageUrl: string; title: string; description: string; linkUrl: string }
): Promise<ActionResult> {
  const admin = await requireSuperAdmin();
  if (!admin) return { success: false, message: "沒有權限執行此操作" };
  if (!input.imageUrl.trim()) return { success: false, message: "請上傳廣告圖片" };

  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { error } = await supabase
    .from("artist_zone_ads")
    .update({
      image_url: input.imageUrl.trim(),
      title: input.title.trim() || null,
      description: input.description.trim() || null,
      link_url: input.linkUrl.trim() || null,
    })
    .eq("id", adId);

  if (error) return { success: false, message: error.message };
  revalidateAdPaths();
  return { success: true, message: "已更新廣告" };
}

export async function toggleArtistZoneAdVisible(adId: string, isVisible: boolean): Promise<ActionResult> {
  const admin = await requireSuperAdmin();
  if (!admin) return { success: false, message: "沒有權限執行此操作" };

  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { error } = await supabase.from("artist_zone_ads").update({ is_visible: isVisible }).eq("id", adId);
  if (error) return { success: false, message: error.message };

  revalidateAdPaths();
  return { success: true, message: isVisible ? "已顯示廣告" : "已隱藏廣告" };
}

export async function deleteArtistZoneAd(adId: string): Promise<ActionResult> {
  const admin = await requireSuperAdmin();
  if (!admin) return { success: false, message: "沒有權限執行此操作" };

  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { error } = await supabase.from("artist_zone_ads").delete().eq("id", adId);
  if (error) return { success: false, message: error.message };

  revalidateAdPaths();
  return { success: true, message: "已刪除廣告" };
}
