import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { InstockSettings } from "@/lib/product-availability";

export async function getInstockSettings(): Promise<InstockSettings | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("instock_settings")
    .select("is_open, starts_at, ends_at")
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error("[LITAN] 讀取現貨區設定失敗", error.message);
    return null;
  }

  return {
    isOpen: data.is_open,
    startsAt: data.starts_at,
    endsAt: data.ends_at,
  };
}
