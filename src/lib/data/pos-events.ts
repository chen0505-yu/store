import { getPosSupabaseServerClient as getSupabaseServerClient } from "@/lib/supabase/pos-server";
import type { PosEvent } from "@/lib/pos-types";

interface PosEventRow {
  id: string;
  name: string;
  event_date: string | null;
  day_label: string | null;
  booth_number: string | null;
  is_active: boolean;
  sort_order: number;
}

function mapRow(row: PosEventRow): PosEvent {
  return {
    id: row.id,
    name: row.name,
    eventDate: row.event_date,
    dayLabel: row.day_label,
    boothNumber: row.booth_number,
    isActive: row.is_active,
    sortOrder: row.sort_order,
  };
}

const EVENT_COLUMNS = "id, name, event_date, day_label, booth_number, is_active, sort_order";

export async function getAllPosEvents(): Promise<PosEvent[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("pos_events")
    .select(EVENT_COLUMNS)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[LITAN POS] 讀取活動失敗", error.message);
    return [];
  }
  return ((data ?? []) as PosEventRow[]).map(mapRow);
}

export async function getPosEventById(id: string): Promise<PosEvent | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase.from("pos_events").select(EVENT_COLUMNS).eq("id", id).maybeSingle();

  if (error || !data) return null;
  return mapRow(data as PosEventRow);
}

// 現場心智模型是「同時只有一個目前活動」：POS 進入頁直接用這個活動，不顯示選活動畫面。
// 回傳所有 is_active=true 的活動，交給呼叫端依數量決定要直接導向、顯示防呆清單、或提示尚未設定。
export async function getActivePosEvents(): Promise<PosEvent[]> {
  const events = await getAllPosEvents();
  return events.filter((e) => e.isActive);
}
