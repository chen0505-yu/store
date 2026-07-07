import { getPosSupabaseServerClient as getSupabaseServerClient } from "@/lib/supabase/pos-server";
import type { PosProductGroup, PosProductVariant } from "@/lib/pos-types";
import { isGroupSoldOut } from "@/lib/pos-product-stock";

interface PosVariantRow {
  id: string;
  group_id: string;
  name: string;
  stock_quantity: number;
  sort_order: number;
}

interface PosGroupRow {
  id: string;
  artist_id: string;
  name: string;
  image_url: string | null;
  price: number;
  note: string | null;
  stock_quantity: number;
  is_active: boolean;
  sort_order: number;
  pos_product_variants: PosVariantRow[];
}

const GROUP_SELECT =
  "id, artist_id, name, image_url, price, note, stock_quantity, is_active, sort_order, " +
  "pos_product_variants(id, group_id, name, stock_quantity, sort_order)";

function mapVariant(row: PosVariantRow): PosProductVariant {
  return {
    id: row.id,
    groupId: row.group_id,
    name: row.name,
    stockQuantity: row.stock_quantity,
    sortOrder: row.sort_order,
  };
}

function mapGroup(row: PosGroupRow): PosProductGroup {
  return {
    id: row.id,
    artistId: row.artist_id,
    name: row.name,
    imageUrl: row.image_url,
    price: Number(row.price),
    note: row.note,
    stockQuantity: row.stock_quantity,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    variants: (row.pos_product_variants ?? [])
      .map(mapVariant)
      .sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

export async function getProductGroupsByArtist(artistId: string): Promise<PosProductGroup[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("pos_product_groups")
    .select(GROUP_SELECT)
    .eq("artist_id", artistId)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[LITAN POS] 讀取商品失敗", error.message);
    return [];
  }
  return ((data ?? []) as unknown as PosGroupRow[]).map(mapGroup);
}

// 給 POS 收銀畫面：可販售、依「有庫存優先、售完墊底」排序後的商品主項。
export async function getSellableProductGroupsByArtist(artistId: string): Promise<PosProductGroup[]> {
  const groups = (await getProductGroupsByArtist(artistId)).filter((g) => g.isActive);
  return [...groups].sort((a, b) => {
    const aSoldOut = isGroupSoldOut(a);
    const bSoldOut = isGroupSoldOut(b);
    if (aSoldOut !== bSoldOut) return aSoldOut ? 1 : -1;
    return a.sortOrder - b.sortOrder;
  });
}

export async function getProductGroupById(id: string): Promise<PosProductGroup | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase.from("pos_product_groups").select(GROUP_SELECT).eq("id", id).maybeSingle();

  if (error || !data) return null;
  return mapGroup(data as unknown as PosGroupRow);
}

export interface PosProductGroupWithArtistName extends PosProductGroup {
  artistName: string;
}

// 給後台商品管理清單使用：跨繪師列出所有商品主項，附上繪師名稱。
export async function getAllProductGroupsWithArtistName(): Promise<PosProductGroupWithArtistName[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("pos_product_groups")
    .select(`${GROUP_SELECT}, pos_artists(name)`)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[LITAN POS] 讀取商品清單失敗", error.message);
    return [];
  }

  return ((data ?? []) as unknown as (PosGroupRow & { pos_artists: { name: string } | null })[]).map((row) => ({
    ...mapGroup(row),
    artistName: row.pos_artists?.name ?? "-",
  }));
}

// 給活動結算匯出用：某個活動底下所有繪師的商品主項（不論有沒有賣出），
// 用來算「剩餘庫存」。用 pos_artists!inner 讓 PostgREST 可以依關聯表的 event_id 篩選。
export async function getProductGroupsByEvent(eventId: string): Promise<PosProductGroupWithArtistName[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("pos_product_groups")
    .select(`${GROUP_SELECT}, pos_artists!inner(name, event_id)`)
    .eq("pos_artists.event_id", eventId)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[LITAN POS] 讀取活動商品失敗", error.message);
    return [];
  }

  return ((data ?? []) as unknown as (PosGroupRow & { pos_artists: { name: string; event_id: string } | null })[]).map(
    (row) => ({
      ...mapGroup(row),
      artistName: row.pos_artists?.name ?? "-",
    })
  );
}
