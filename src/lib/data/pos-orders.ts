import { getPosSupabaseServerClient as getSupabaseServerClient } from "@/lib/supabase/pos-server";
import type { PosOrder, PosOrderItem } from "@/lib/pos-types";

interface PosOrderItemRow {
  id: string;
  group_id: string | null;
  group_name: string;
  variant_id: string | null;
  variant_name: string | null;
  unit_price: number;
  quantity: number;
  subtotal: number;
  is_freebie: boolean;
  pos_return_items: { quantity: number }[];
}

interface PosOrderRow {
  id: string;
  order_number: string;
  event_id: string;
  event_name: string;
  event_day_label: string | null;
  event_booth_number: string | null;
  artist_id: string;
  artist_name: string;
  staff_id: string | null;
  subtotal_amount: number;
  total_amount: number;
  received_amount: number;
  change_amount: number;
  created_at: string;
  pos_staff: { display_name: string } | null;
  pos_order_items: PosOrderItemRow[];
}

const ORDER_SELECT =
  "id, order_number, event_id, event_name, event_day_label, event_booth_number, artist_id, artist_name, " +
  "staff_id, subtotal_amount, total_amount, received_amount, change_amount, created_at, " +
  "pos_staff(display_name), pos_order_items(id, group_id, group_name, variant_id, variant_name, unit_price, quantity, subtotal, is_freebie, pos_return_items(quantity))";

function mapItem(row: PosOrderItemRow): PosOrderItem {
  return {
    id: row.id,
    groupId: row.group_id,
    groupName: row.group_name,
    variantId: row.variant_id,
    variantName: row.variant_name,
    unitPrice: Number(row.unit_price),
    quantity: row.quantity,
    subtotal: Number(row.subtotal),
    isFreebie: row.is_freebie,
    returnedQuantity: (row.pos_return_items ?? []).reduce((sum, r) => sum + r.quantity, 0),
  };
}

function mapOrder(row: PosOrderRow): PosOrder {
  return {
    id: row.id,
    orderNumber: row.order_number,
    eventId: row.event_id,
    eventName: row.event_name,
    eventDayLabel: row.event_day_label,
    eventBoothNumber: row.event_booth_number,
    artistId: row.artist_id,
    artistName: row.artist_name,
    staffId: row.staff_id,
    staffName: row.pos_staff?.display_name ?? null,
    subtotalAmount: Number(row.subtotal_amount),
    totalAmount: Number(row.total_amount),
    receivedAmount: Number(row.received_amount),
    changeAmount: Number(row.change_amount),
    createdAt: row.created_at,
    items: (row.pos_order_items ?? []).map(mapItem),
  };
}

export interface PosOrderFilter {
  eventId?: string;
  artistId?: string;
  dateFrom?: string; // yyyy-mm-dd
  dateTo?: string; // yyyy-mm-dd
  orderNumber?: string; // 局部比對，給 POS 前台「輸入訂單編號搜尋」用
  limit?: number;
}

export async function getPosOrders(filter: PosOrderFilter = {}): Promise<PosOrder[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  let query = supabase.from("pos_orders").select(ORDER_SELECT).order("created_at", { ascending: false });

  if (filter.eventId) query = query.eq("event_id", filter.eventId);
  if (filter.artistId) query = query.eq("artist_id", filter.artistId);
  if (filter.dateFrom) query = query.gte("created_at", `${filter.dateFrom}T00:00:00`);
  if (filter.dateTo) query = query.lte("created_at", `${filter.dateTo}T23:59:59`);
  if (filter.orderNumber) query = query.ilike("order_number", `%${filter.orderNumber}%`);
  if (filter.limit) query = query.limit(filter.limit);

  const { data, error } = await query;
  if (error) {
    console.error("[LITAN POS] 讀取訂單失敗", error.message);
    return [];
  }
  return ((data ?? []) as unknown as PosOrderRow[]).map(mapOrder);
}

export async function getPosOrderById(id: string): Promise<PosOrder | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase.from("pos_orders").select(ORDER_SELECT).eq("id", id).maybeSingle();
  if (error || !data) return null;
  return mapOrder(data as unknown as PosOrderRow);
}
