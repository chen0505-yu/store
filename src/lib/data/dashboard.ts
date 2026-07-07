import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { ArrivalStatus } from "@/lib/types";

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
  ]);

  return {
    preordering,
    notArrived,
    arrived,
    packing,
    listed,
    instockTotal: instockTotalResult,
    instockSoldOut: instockSoldOutResult,
    instockPendingOrders: instockPendingResult.count ?? 0,
    instockFiledOrders: instockFiledResult.count ?? 0,
  };
}
