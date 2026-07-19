import { getSupabaseServerClient } from "@/lib/supabase/server";

export interface ArtistZoneAd {
  id: string;
  imageUrl: string;
  title: string | null;
  description: string | null;
  linkUrl: string | null;
  isVisible: boolean;
  sortOrder: number;
}

const AD_COLUMNS = "id, image_url, title, description, link_url, is_visible, sort_order";

function mapRow(row: {
  id: string;
  image_url: string;
  title: string | null;
  description: string | null;
  link_url: string | null;
  is_visible: boolean;
  sort_order: number;
}): ArtistZoneAd {
  return {
    id: row.id,
    imageUrl: row.image_url,
    title: row.title,
    description: row.description,
    linkUrl: row.link_url,
    isVisible: row.is_visible,
    sortOrder: row.sort_order,
  };
}

// 繪師預購專區首頁最上方的廣告區，只顯示啟用中的，依 sort_order 排序。
export async function getVisibleArtistZoneAds(): Promise<ArtistZoneAd[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("artist_zone_ads")
    .select(AD_COLUMNS)
    .eq("is_visible", true)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[LITAN] 讀取繪師專區廣告失敗", error.message);
    return [];
  }
  return (data ?? []).map(mapRow);
}

// 後台管理頁：列出全部廣告（含隱藏的）。
export async function listAllArtistZoneAds(): Promise<ArtistZoneAd[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const { data, error } = await supabase.from("artist_zone_ads").select(AD_COLUMNS).order("sort_order", { ascending: true });

  if (error) {
    console.error("[LITAN] 讀取繪師專區廣告失敗", error.message);
    return [];
  }
  return (data ?? []).map(mapRow);
}
