import { getPosSupabaseServerClient as getSupabaseServerClient } from "@/lib/supabase/pos-server";
import type { PosArtistGroup } from "@/lib/pos-types";

interface PosArtistGroupMemberRow {
  artist_id: string;
  pos_artists: { id: string; name: string; artist_code: string; is_active: boolean } | null;
}

interface PosArtistGroupRow {
  id: string;
  event_id: string;
  name: string;
  sort_order: number;
  pos_artist_group_members: PosArtistGroupMemberRow[];
}

const GROUP_SELECT =
  "id, event_id, name, sort_order, " +
  "pos_artist_group_members(artist_id, pos_artists(id, name, artist_code, is_active))";

export interface PosArtistGroupMember {
  id: string;
  name: string;
  artistCode: string;
  isActive: boolean;
}

export interface PosArtistGroupWithMembers extends PosArtistGroup {
  members: PosArtistGroupMember[];
}

function mapGroup(row: PosArtistGroupRow): PosArtistGroupWithMembers {
  const members = (row.pos_artist_group_members ?? [])
    .map((m) => m.pos_artists)
    .filter((a): a is NonNullable<typeof a> => a !== null)
    .map((a) => ({ id: a.id, name: a.name, artistCode: a.artist_code, isActive: a.is_active }));

  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    sortOrder: row.sort_order,
    memberArtistIds: members.map((m) => m.id),
    members,
  };
}

// 給 POS 前台活動入口使用：這場活動底下的共用攤位（跟一般 Artist 卡片並列顯示）。
export async function getArtistGroupsByEvent(eventId: string): Promise<PosArtistGroupWithMembers[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("pos_artist_groups")
    .select(GROUP_SELECT)
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[LITAN POS] 讀取共用攤位失敗", error.message);
    return [];
  }
  return ((data ?? []) as unknown as PosArtistGroupRow[]).map(mapGroup);
}

export async function getArtistGroupById(id: string): Promise<PosArtistGroupWithMembers | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase.from("pos_artist_groups").select(GROUP_SELECT).eq("id", id).maybeSingle();

  if (error || !data) return null;
  return mapGroup(data as unknown as PosArtistGroupRow);
}

export interface PosArtistGroupWithEventName extends PosArtistGroupWithMembers {
  eventName: string;
}

// 給後台共用攤位管理列表使用：跨活動列出所有共用攤位，附上活動名稱。
export async function getAllArtistGroupsWithEventName(): Promise<PosArtistGroupWithEventName[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("pos_artist_groups")
    .select(`${GROUP_SELECT}, pos_events(name)`)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[LITAN POS] 讀取共用攤位清單失敗", error.message);
    return [];
  }

  return ((data ?? []) as unknown as (PosArtistGroupRow & { pos_events: { name: string } | null })[]).map((row) => ({
    ...mapGroup(row),
    eventName: row.pos_events?.name ?? "-",
  }));
}
