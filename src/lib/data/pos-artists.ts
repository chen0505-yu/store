import { getPosSupabaseServerClient as getSupabaseServerClient } from "@/lib/supabase/pos-server";
import type { PosArtist } from "@/lib/pos-types";

interface PosArtistRow {
  id: string;
  event_id: string;
  artist_code: string;
  name: string;
  is_active: boolean;
  sort_order: number;
}

const ARTIST_SELECT = "id, event_id, artist_code, name, is_active, sort_order";

function mapRow(row: PosArtistRow): PosArtist {
  return {
    id: row.id,
    eventId: row.event_id,
    artistCode: row.artist_code,
    name: row.name,
    isActive: row.is_active,
    sortOrder: row.sort_order,
  };
}

export async function getArtistsByEvent(eventId: string): Promise<PosArtist[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("pos_artists")
    .select(ARTIST_SELECT)
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[LITAN POS] 讀取繪師失敗", error.message);
    return [];
  }
  return ((data ?? []) as PosArtistRow[]).map(mapRow);
}

export async function getActiveArtistsByEvent(eventId: string): Promise<PosArtist[]> {
  const artists = await getArtistsByEvent(eventId);
  return artists.filter((a) => a.isActive);
}

export async function getArtistById(id: string): Promise<PosArtist | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("pos_artists")
    .select(ARTIST_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return mapRow(data as PosArtistRow);
}

export interface PosArtistWithEventName extends PosArtist {
  eventName: string;
  // 這位繪師底下是否已經有歷史訂單。有的話後台「刪除」按鈕會改成「封存」
  // （刪除會撞到 pos_orders 的 foreign key，改成把 is_active 設 false）。
  hasOrders: boolean;
}

// 給後台繪師管理清單使用：跨活動列出所有繪師，附上活動名稱、是否已有訂單。
export async function getAllArtistsWithEventName(): Promise<PosArtistWithEventName[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const [{ data, error }, { data: orderRows }] = await Promise.all([
    supabase
      .from("pos_artists")
      .select(`${ARTIST_SELECT}, pos_events(name)`)
      .order("sort_order", { ascending: true }),
    supabase.from("pos_orders").select("artist_id"),
  ]);

  if (error) {
    console.error("[LITAN POS] 讀取繪師清單失敗", error.message);
    return [];
  }

  const artistIdsWithOrders = new Set((orderRows ?? []).map((row) => (row as { artist_id: string }).artist_id));

  return ((data ?? []) as unknown as (PosArtistRow & { pos_events: { name: string } | null })[]).map((row) => ({
    ...mapRow(row),
    eventName: row.pos_events?.name ?? "-",
    hasOrders: artistIdsWithOrders.has(row.id),
  }));
}
