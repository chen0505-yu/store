import { getSupabaseServerClient } from "@/lib/supabase/server";

export interface Tag {
  id: string;
  name: string;
}

export async function getAllTags(): Promise<Tag[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("product_tags")
    .select("id, name")
    .order("name", { ascending: true });

  if (error) {
    console.error("[LITAN] 讀取 Tag 失敗", error.message);
    return [];
  }

  return data ?? [];
}
