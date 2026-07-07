import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { AnnouncementCategory } from "@/lib/types";

export interface Announcement {
  id: string;
  title: string;
  content: string;
  category: AnnouncementCategory;
  isPinned: boolean;
  isPublic: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

const COLUMNS = "id, title, content, category, is_pinned, is_public, is_archived, created_at, updated_at";

function mapRow(row: {
  id: string;
  title: string;
  content: string;
  category: AnnouncementCategory;
  is_pinned: boolean;
  is_public: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}): Announcement {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    category: row.category,
    isPinned: row.is_pinned,
    isPublic: row.is_public,
    isArchived: row.is_archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// 前台顯示：只有公開且未封存的公告，置頂優先，其次依建立時間新到舊。
export async function getPublicAnnouncements(limit = 5): Promise<Announcement[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("announcements")
    .select(COLUMNS)
    .eq("is_public", true)
    .eq("is_archived", false)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[LITAN] 讀取公告失敗", error.message);
    return [];
  }

  return (data ?? []).map(mapRow);
}

// 後台管理：顯示全部公告，包含未公開／已封存的。
export async function getAllAnnouncements(): Promise<Announcement[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("announcements")
    .select(COLUMNS)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[LITAN] 讀取公告失敗", error.message);
    return [];
  }

  return (data ?? []).map(mapRow);
}
