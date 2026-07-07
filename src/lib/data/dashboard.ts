import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { ArrivalStatus } from "@/lib/types";
import { getShipments } from "@/lib/data/shipments";

export interface DashboardStats {
  preordering: number;
  notArrived: number;
  arrived: number;
  packing: number;
  listed: number;
  instockTotal: number;
  instockSoldOut: number;
  instockPendingOrders: number; // 尚未填賣貨便訂單編號
  instockFiledOrders: number; // 已填賣貨便訂單編號
  // 後台待處理數：給 Dashboard「待處理事項」卡片用，方便一進後台就知道有哪些事要處理。
  unreconciledPayments: number; // 未對帳數：預購訂單匯款狀態還沒確認完成
  unrepliedMessages: number; // 留言未回覆數：客戶留言後台還沒讀
  preorderUnprocessedOrders: number; // 預購訂單未處理數：訂單狀態還沒到「已完成」
  instockUnprocessedOrders: number; // 現貨訂單未處理數：訂單狀態還沒到「已完成」
  shipmentsNeedingAttention: number; // 出貨訂單待處理數：未列印/未填賣貨便編號/待二補/未完成
}

const EMPTY_STATS: DashboardStats = {
  preordering: 0,
  notArrived: 0,
  arrived: 0,
  packing: 0,
  listed: 0,
  instockTotal: 0,
  instockSoldOut: 0,
  instockPendingOrders: 0,
  instockFiledOrders: 0,
  unreconciledPayments: 0,
  unrepliedMessages: 0,
  preorderUnprocessedOrders: 0,
  instockUnprocessedOrders: 0,
  shipmentsNeedingAttention: 0,
};

// 商品架構改為 老師 → 品項（product_groups） → 細項，預購到貨狀態統計改成算「品項」數量，
// 不再是舊的扁平 products 表。
async function countPreorderProductsByStatus(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  status: ArrivalStatus
): Promise<number> {
  const { count } = await supabase!
    .from("product_groups")
    .select("id", { count: "exact", head: true })
    .eq("is_archived", false)
    .eq("arrival_status", status);
  return count ?? 0;
}

// 現貨也改為 老師 → 品項（instock_product_groups） → 細項（instock_product_variants），
// 「現貨商品數」統計改成算未封存品項底下的「細項」數量（細項才是實際可購買的最小單位）。
async function countInstockVariants(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  soldOut?: boolean
): Promise<number> {
  const { data: groups } = await supabase!
    .from("instock_product_groups")
    .select("id")
    .eq("is_archived", false);
  const groupIds = (groups ?? []).map((g) => g.id);
  if (groupIds.length === 0) return 0;

  let query = supabase!
    .from("instock_product_variants")
    .select("id", { count: "exact", head: true })
    .in("instock_product_group_id", groupIds);
  if (soldOut !== undefined) query = query.eq("is_sold_out", soldOut);

  const { count } = await query;
  return count ?? 0;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return EMPTY_STATS;

  const [
    preordering,
    notArrived,
    arrived,
    packing,
    listed,
    instockTotalResult,
    instockSoldOutResult,
    instockPendingResult,
    instockFiledResult,
    unreconciledPaymentsResult,
    unrepliedMessagesResult,
    preorderUnprocessedResult,
    instockUnprocessedResult,
    shipments,
  ] = await Promise.all([
    countPreorderProductsByStatus(supabase, "preordering"),
    countPreorderProductsByStatus(supabase, "not_arrived"),
    countPreorderProductsByStatus(supabase, "arrived"),
    countPreorderProductsByStatus(supabase, "packing"),
    countPreorderProductsByStatus(supabase, "listed"),
    countInstockVariants(supabase),
    countInstockVariants(supabase, true),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("order_type", "instock")
      .is("marketplace_order_number", null),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("order_type", "instock")
      .not("marketplace_order_number", "is", null),
    // 未對帳數：預購訂單的匯款狀態還沒到「已確認」或「已取消」這兩個確定的結案狀態。
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("order_type", "preorder")
      .in("payment_status", ["not_remitted", "pending_confirmation", "underpaid", "needs_supplement"]),
    // 留言未回覆數：客戶留言，後台還沒讀。
    supabase
      .from("order_messages")
      .select("id", { count: "exact", head: true })
      .eq("author_type", "customer")
      .eq("is_read", false),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("order_type", "preorder")
      .neq("status", "completed"),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("order_type", "instock")
      .neq("status", "completed"),
    // 出貨訂單待處理數：借用出貨訂單管理頁本來就有的邏輯（未列印/未填賣貨便編號/待二補/未完成），
    // 避免另外重寫一份判斷邏輯造成兩邊數字對不上。
    getShipments(),
  ]);

  const shipmentsNeedingAttention = shipments.filter(
    (s) =>
      s.status !== "completed" ||
      !s.printedAt ||
      (s.pickupMethod !== "event_pickup" && !s.marketplaceOrderNumber) ||
      s.supplementStatus === "pending"
  ).length;

  return {
    preordering,
    notArrived,
    arrived,
    packing,
    listed,
    instockTotal: instockTotalResult,
    instockSoldOut: instockSoldOutResult,
    instockPendingOrders: instockPendingResult.count ?? 0,
    unreconciledPayments: unreconciledPaymentsResult.count ?? 0,
    unrepliedMessages: unrepliedMessagesResult.count ?? 0,
    preorderUnprocessedOrders: preorderUnprocessedResult.count ?? 0,
    instockUnprocessedOrders: instockUnprocessedResult.count ?? 0,
    shipmentsNeedingAttention,
    instockFiledOrders: instockFiledResult.count ?? 0,
  };
}
