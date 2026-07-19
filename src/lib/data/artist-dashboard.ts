import { getSupabaseServerClient } from "@/lib/supabase/server";

export interface ArtistDashboardStats {
  preorderingProducts: number; // 預購中商品數
  totalOrders: number; // 訂單總數
  pendingPaymentConfirmation: number; // 待確認匯款數
  confirmedOrders: number; // 已確認訂單數
  pendingMergeItems: number; // 待合併出貨數
  pendingMarketplaceNumberShipments: number; // 待填賣貨便編號數
  completedOrders: number; // 已完成訂單數
  totalAmount: number; // 訂單總金額
}

const EMPTY_STATS: ArtistDashboardStats = {
  preorderingProducts: 0,
  totalOrders: 0,
  pendingPaymentConfirmation: 0,
  confirmedOrders: 0,
  pendingMergeItems: 0,
  pendingMarketplaceNumberShipments: 0,
  completedOrders: 0,
  totalAmount: 0,
};

// 繪師 Dashboard 統計：所有查詢都用 teacher_id 過濾到只剩這位繪師自己的商店資料，
// orders 表本身沒有 teacher_id 欄位，要先從 artist_product_groups 找出這位繪師的
// 品項 id，再透過 order_items.artist_group_id 反查回屬於他的訂單 id 集合。
export async function getArtistDashboardStats(teacherId: string): Promise<ArtistDashboardStats> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return EMPTY_STATS;

  const { data: groups } = await supabase
    .from("artist_product_groups")
    .select("id, arrival_status, is_archived")
    .eq("teacher_id", teacherId);
  const groupRows = groups ?? [];
  const preorderingProducts = groupRows.filter((g) => !g.is_archived && g.arrival_status === "preordering").length;
  const groupIds = groupRows.map((g) => g.id);

  if (groupIds.length === 0) return { ...EMPTY_STATS, preorderingProducts };

  const { data: orderItems } = await supabase.from("order_items").select("order_id").in("artist_group_id", groupIds);
  const orderIds = Array.from(new Set((orderItems ?? []).map((oi) => oi.order_id)));

  if (orderIds.length === 0) return { ...EMPTY_STATS, preorderingProducts };

  const [{ data: orders }, { count: pendingMergeItems }, { data: mergedShipmentItems }] = await Promise.all([
    supabase
      .from("orders")
      .select("id, status, payment_status, total_amount")
      .in("id", orderIds)
      .eq("order_type", "artist"),
    supabase
      .from("shipment_items")
      .select("id", { count: "exact", head: true })
      .eq("order_type", "artist")
      .in("order_id", orderIds)
      .is("shipment_id", null),
    supabase.from("shipment_items").select("shipment_id").in("order_id", orderIds).not("shipment_id", "is", null),
  ]);

  const orderRows = orders ?? [];
  const totalOrders = orderRows.length;
  const pendingPaymentConfirmation = orderRows.filter((o) => o.payment_status === "pending_confirmation").length;
  const confirmedOrders = orderRows.filter((o) => o.payment_status === "confirmed").length;
  const completedOrders = orderRows.filter((o) => o.status === "completed").length;
  const totalAmount = orderRows.reduce((sum, o) => sum + Number(o.total_amount), 0);

  const shipmentIds = Array.from(
    new Set((mergedShipmentItems ?? []).map((si) => si.shipment_id).filter((id): id is string => Boolean(id)))
  );
  let pendingMarketplaceNumberShipments = 0;
  if (shipmentIds.length > 0) {
    const { count } = await supabase
      .from("shipments")
      .select("id", { count: "exact", head: true })
      .in("id", shipmentIds)
      .eq("shipment_type", "artist")
      .is("marketplace_order_number", null);
    pendingMarketplaceNumberShipments = count ?? 0;
  }

  return {
    preorderingProducts,
    totalOrders,
    pendingPaymentConfirmation,
    confirmedOrders,
    pendingMergeItems: pendingMergeItems ?? 0,
    pendingMarketplaceNumberShipments,
    completedOrders,
    totalAmount,
  };
}
