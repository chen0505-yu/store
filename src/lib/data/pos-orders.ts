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
  artist_id: string | null;
  artist_name: string | null;
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
  shared_group_id: string | null;
  shared_group_name: string | null;
  pos_staff: { display_name: string } | null;
  pos_order_items: PosOrderItemRow[];
}

const ORDER_SELECT =
  "id, order_number, event_id, event_name, event_day_label, event_booth_number, artist_id, artist_name, " +
  "staff_id, subtotal_amount, total_amount, received_amount, change_amount, created_at, " +
  "shared_group_id, shared_group_name, pos_staff(display_name), " +
  "pos_order_items(id, group_id, group_name, variant_id, variant_name, unit_price, quantity, subtotal, is_freebie, artist_id, artist_name, pos_return_items(quantity))";

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
    artistId: row.artist_id,
    artistName: row.artist_name,
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
    sharedGroupId: row.shared_group_id,
    sharedGroupName: row.shared_group_name,
  };
}

export interface PosOrderFilter {
  eventId?: string;
  artistId?: string;
  sharedGroupId?: string; // 給共用攤位收銀畫面的「最近訂單」查詢用
  dateFrom?: string; // yyyy-mm-dd
  dateTo?: string; // yyyy-mm-dd
  orderNumber?: string; // 局部比對，給 POS 前台「輸入訂單編號搜尋」用
  limit?: number;
}

// 依 Artist 篩選訂單時，不能只看 pos_orders.artist_id——共用攤位訂單的這個欄位只是
// 「代表 Artist」快照，不代表商品真正的歸屬。改成找出「這位 Artist 真正有商品在裡面」
// 的訂單 id：
//   1) pos_order_items.artist_id 直接命中（一般訂單與共用攤位訂單都適用，是權威來源）。
//   2) 非共用攤位的訂單（shared_group_id is null）用 pos_orders.artist_id 命中——這類訂單
//      本來就是單一 Artist 的整筆訂單，即使是 migration 039 之前、明細 artist_id 還沒回填
//      成功的舊資料，訂單層級的 artist_id 仍然是唯一且正確的判斷依據。
// 兩者取聯集，避免共用攤位訂單因為「代表 Artist」剛好等於篩選對象、但實際上沒有該
// Artist 商品」而被誤收進來。
async function findOrderIdsForArtist(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  artistId: string
): Promise<string[]> {
  if (!supabase) return [];

  const [itemMatches, nonSharedOrderMatches] = await Promise.all([
    supabase.from("pos_order_items").select("order_id").eq("artist_id", artistId),
    supabase.from("pos_orders").select("id").eq("artist_id", artistId).is("shared_group_id", null),
  ]);

  const ids = new Set<string>();
  for (const row of (itemMatches.data ?? []) as { order_id: string }[]) ids.add(row.order_id);
  for (const row of (nonSharedOrderMatches.data ?? []) as { id: string }[]) ids.add(row.id);
  return [...ids];
}

export async function getPosOrders(filter: PosOrderFilter = {}): Promise<PosOrder[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  let query = supabase.from("pos_orders").select(ORDER_SELECT).order("created_at", { ascending: false });

  if (filter.eventId) query = query.eq("event_id", filter.eventId);
  if (filter.artistId) {
    const orderIds = await findOrderIdsForArtist(supabase, filter.artistId);
    if (orderIds.length === 0) return [];
    query = query.in("id", orderIds);
  }
  if (filter.sharedGroupId) query = query.eq("shared_group_id", filter.sharedGroupId);
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
