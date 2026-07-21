import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getShipmentItemsForAdmin, type AdminShipmentItem } from "@/lib/data/admin-shipment-items";
import { getShipments, type AdminShipment } from "@/lib/data/shipments";
import { listArtistAccounts } from "@/lib/data/artist-accounts";
import { MERGEABLE_SHIPMENT_STATUSES } from "@/lib/shipment-status";

export interface OpsDashboardCards {
  pendingPayments: number; // 待確認匯款：預購＋繪師訂單 payment_status='pending_confirmation'
  unrepliedMessages: number; // 未回覆留言
  preorderUnprocessedOrders: number; // 葴葴預購待處理訂單
  artistUnprocessedOrders: number; // 繪師預購待處理訂單
  mergeableItems: number; // 可建立出貨訂單：已到台/整理中/已開賣貨便且尚未合併的品項（葴葴＋繪師合計）
  pendingListing: number; // 待開賣場：整理中（packing）品項數（葴葴＋繪師合計）
  missingMarketplaceNumber: number; // 待填賣貨便訂單編號：非面交且尚未完成的出貨單缺編號（葴葴＋繪師合計）
  incompleteShipments: number; // 待完成訂單：尚未完成的出貨單（葴葴＋繪師合計）
}

export interface VerticalFinanceStats {
  todayOrders: number;
  monthOrders: number;
  todayCompleted: number; // 今日完成訂單數：以「今日完成的出貨單數」近似，一張出貨單可能合併多筆訂單
  monthCompleted: number;
}

export interface ArtistOverviewRow {
  teacherId: string;
  teacherName: string;
  preorderingProducts: number;
  totalOrders: number;
  pendingPaymentConfirmation: number;
  pendingMergeItems: number;
  pendingMarketplaceNumberShipments: number;
  completedOrders: number;
  totalAmount: number;
}

export interface OpsDashboardAlerts {
  unpaidAfterDeadline: number; // 預購已截止但仍有未匯款訂單（僅算葴葴老師，繪師沒有統一截止時間欄位可跨老師比對，見下方註解）
  arrivedNotShipped: number; // 商品已到貨但尚未建立出貨單
  listedMissingMarketplaceNumber: number; // 已開賣場但尚未填賣貨便編號
  pendingSupplements: number; // 補款或二補尚未完成
  productsWithoutImage: number; // 沒有圖片的商品
}

export interface OpsDashboardStats {
  cards: OpsDashboardCards;
  finance: {
    preorder: VerticalFinanceStats;
    artist: VerticalFinanceStats;
  };
  artists: ArtistOverviewRow[];
  alerts: OpsDashboardAlerts;
}

const EMPTY_FINANCE: VerticalFinanceStats = {
  todayOrders: 0,
  monthOrders: 0,
  todayCompleted: 0,
  monthCompleted: 0,
};

const EMPTY_STATS: OpsDashboardStats = {
  cards: {
    pendingPayments: 0,
    unrepliedMessages: 0,
    preorderUnprocessedOrders: 0,
    artistUnprocessedOrders: 0,
    mergeableItems: 0,
    pendingListing: 0,
    missingMarketplaceNumber: 0,
    incompleteShipments: 0,
  },
  finance: { preorder: EMPTY_FINANCE, artist: EMPTY_FINANCE },
  artists: [],
  alerts: {
    unpaidAfterDeadline: 0,
    arrivedNotShipped: 0,
    listedMissingMarketplaceNumber: 0,
    pendingSupplements: 0,
    productsWithoutImage: 0,
  },
};

// 日期／月份邊界一律用台北時區（UTC+8）計算「今天」「本月」，
// 避免 Vercel 伺服器用 UTC 時間跑，半夜台灣使用者看到的「今日」數字跟系統對不上。
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

function taipeiDayStartISO(): string {
  const taipei = new Date(Date.now() + TAIPEI_OFFSET_MS);
  return new Date(
    Date.UTC(taipei.getUTCFullYear(), taipei.getUTCMonth(), taipei.getUTCDate()) - TAIPEI_OFFSET_MS
  ).toISOString();
}

function taipeiMonthStartISO(): string {
  const taipei = new Date(Date.now() + TAIPEI_OFFSET_MS);
  return new Date(Date.UTC(taipei.getUTCFullYear(), taipei.getUTCMonth(), 1) - TAIPEI_OFFSET_MS).toISOString();
}

function countMergeable(items: AdminShipmentItem[]): number {
  return items.filter((i) => MERGEABLE_SHIPMENT_STATUSES.includes(i.status) && !i.merged).length;
}

function countMissingMarketplaceNumber(shipments: AdminShipment[]): number {
  return shipments.filter((s) => s.pickupMethod !== "event_pickup" && !s.marketplaceOrderNumber).length;
}

function countIncomplete(shipments: AdminShipment[]): number {
  return shipments.filter((s) => s.status !== "completed").length;
}

// 今日／本月新增訂單數：純計數，不再一併撈金額（營運 Dashboard v2 移除金額類卡片）。
async function fetchOrdersCount(
  supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>,
  orderType: "preorder" | "artist",
  sinceISO: string
): Promise<number> {
  const { count } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("order_type", orderType)
    .gte("created_at", sinceISO);
  return count ?? 0;
}

async function fetchCompletedShipmentCount(
  supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>,
  shipmentType: "preorder" | "artist",
  sinceISO: string
): Promise<number> {
  const { count } = await supabase
    .from("shipments")
    .select("id", { count: "exact", head: true })
    .eq("shipment_type", shipmentType)
    .eq("status", "completed")
    .gte("completed_at", sinceISO);
  return count ?? 0;
}

export async function getOpsDashboardStats(): Promise<OpsDashboardStats> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return EMPTY_STATS;

  const todayStart = taipeiDayStartISO();
  const monthStart = taipeiMonthStartISO();

  const [
    pendingPaymentsResult,
    unrepliedMessagesResult,
    preorderUnprocessedResult,
    artistUnprocessedResult,
    pendingListingPreorderResult,
    pendingListingArtistResult,
    noImagePreorderResult,
    noImageArtistResult,
    preorderItems,
    artistItems,
    preorderShipments,
    artistShipments,
    artistGroupsResult,
    artistAccounts,
    pendingSupplementsResult,
    preorderTodayCount,
    preorderMonthCount,
    artistTodayCount,
    artistMonthCount,
    preorderTodayCompleted,
    preorderMonthCompleted,
    artistTodayCompleted,
    artistMonthCompleted,
  ] = await Promise.all([
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .in("order_type", ["preorder", "artist"])
      .eq("payment_status", "pending_confirmation"),
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
      .eq("order_type", "artist")
      .neq("status", "completed"),
    supabase
      .from("product_groups")
      .select("id", { count: "exact", head: true })
      .eq("is_archived", false)
      .eq("arrival_status", "packing"),
    supabase
      .from("artist_product_groups")
      .select("id", { count: "exact", head: true })
      .eq("is_archived", false)
      .eq("arrival_status", "packing"),
    supabase
      .from("product_groups")
      .select("id", { count: "exact", head: true })
      .eq("is_archived", false)
      .is("image_url", null),
    supabase
      .from("artist_product_groups")
      .select("id", { count: "exact", head: true })
      .eq("is_archived", false)
      .is("image_url", null),
    getShipmentItemsForAdmin("preorder"),
    getShipmentItemsForAdmin("artist"),
    getShipments("preorder"),
    getShipments("artist"),
    supabase.from("artist_product_groups").select("id, teacher_id, arrival_status, is_archived"),
    listArtistAccounts(),
    supabase.from("supplements").select("order_id", { count: "exact", head: true }).eq("status", "pending"),
    fetchOrdersCount(supabase, "preorder", todayStart),
    fetchOrdersCount(supabase, "preorder", monthStart),
    fetchOrdersCount(supabase, "artist", todayStart),
    fetchOrdersCount(supabase, "artist", monthStart),
    fetchCompletedShipmentCount(supabase, "preorder", todayStart),
    fetchCompletedShipmentCount(supabase, "preorder", monthStart),
    fetchCompletedShipmentCount(supabase, "artist", todayStart),
    fetchCompletedShipmentCount(supabase, "artist", monthStart),
  ]);

  const mergeableItems = countMergeable(preorderItems) + countMergeable(artistItems);
  const missingMarketplaceNumber =
    countMissingMarketplaceNumber(preorderShipments) + countMissingMarketplaceNumber(artistShipments);
  const incompleteShipments = countIncomplete(preorderShipments) + countIncomplete(artistShipments);

  const arrivedNotShipped =
    preorderItems.filter((i) => i.status === "arrived" && !i.merged).length +
    artistItems.filter((i) => i.status === "arrived" && !i.merged).length;
  const listedMissingMarketplaceNumber =
    [...preorderShipments, ...artistShipments].filter(
      (s) => s.status === "listed" && s.pickupMethod !== "event_pickup" && !s.marketplaceOrderNumber
    ).length;

  // 預購已截止但仍有未匯款訂單：只能算「葴葴老師」端，因為截止時間存在 teachers.preorder_ends_at，
  // 繪師的匯款截止提醒已經包含在「待確認匯款」卡片與繪師總覽裡（remittance_ends_at 意義不同）。
  // AdminShipmentItem（preorder）沒有帶老師 id，只有 teacherName 快照，改用名稱比對已截止老師名單。
  const { data: endedTeachers } = await supabase
    .from("teachers")
    .select("name")
    .eq("is_artist_shop", false)
    .not("preorder_ends_at", "is", null)
    .lt("preorder_ends_at", new Date().toISOString());
  const endedTeacherNames = new Set((endedTeachers ?? []).map((t) => t.name));
  const unpaidAfterDeadlineOrderIds = new Set(
    preorderItems
      .filter(
        (i) =>
          i.teacherName &&
          endedTeacherNames.has(i.teacherName) &&
          i.paymentStatus &&
          ["not_remitted", "pending_confirmation", "underpaid", "needs_supplement"].includes(i.paymentStatus)
      )
      .map((i) => i.orderId)
  );

  // 沒有圖片的商品：葴葴＋繪師合計，image_url 是建立/編輯品項時自動快取的第一張圖，
  // 為 null 代表這個品項完全沒上傳過圖片。
  const productsWithoutImage = (noImagePreorderResult.count ?? 0) + (noImageArtistResult.count ?? 0);

  // 補款或二補尚未完成：全站（葴葴＋繪師）狀態為 pending 的補款筆數。
  const pendingSupplements = pendingSupplementsResult.count ?? 0;

  // 繪師總覽：先算每位繪師「預購中商品數」，再用已經批次查好的 artistItems／artistShipments
  // 依 teacherId／teacherName 分組彙總，避免對每位繪師各自重新查一次資料庫（N+1）。
  const artistGroupRows = artistGroupsResult.data ?? [];
  const preorderingByTeacher = new Map<string, number>();
  for (const g of artistGroupRows) {
    if (g.is_archived || g.arrival_status !== "preordering") continue;
    preorderingByTeacher.set(g.teacher_id, (preorderingByTeacher.get(g.teacher_id) ?? 0) + 1);
  }

  const itemsByTeacher = new Map<string, AdminShipmentItem[]>();
  for (const item of artistItems) {
    if (!item.teacherId) continue;
    const list = itemsByTeacher.get(item.teacherId) ?? [];
    list.push(item);
    itemsByTeacher.set(item.teacherId, list);
  }

  // AdminShipment 沒有 teacherId（只有各品項的 teacherName 快照），依名稱比對繪師名單來分組，
  // 跟既有 CompletedShipmentsList.tsx 的 sellerName() 用同一種做法，維持一致。
  const nameToTeacherId = new Map(artistAccounts.map((a) => [a.teacherName, a.teacherId]));
  const shipmentsByTeacher = new Map<string, AdminShipment[]>();
  for (const shipment of artistShipments) {
    const name = shipment.items[0]?.teacherName;
    const teacherId = name ? nameToTeacherId.get(name) : undefined;
    if (!teacherId) continue;
    const list = shipmentsByTeacher.get(teacherId) ?? [];
    list.push(shipment);
    shipmentsByTeacher.set(teacherId, list);
  }

  const artists: ArtistOverviewRow[] = artistAccounts.map((a) => {
    const items = itemsByTeacher.get(a.teacherId) ?? [];
    const shipmentsForTeacher = shipmentsByTeacher.get(a.teacherId) ?? [];
    const orderIds = new Set(items.map((i) => i.orderId));
    const pendingPaymentOrderIds = new Set(
      items.filter((i) => i.paymentStatus === "pending_confirmation").map((i) => i.orderId)
    );
    const completedOrderIds = new Set(items.filter((i) => i.status === "completed").map((i) => i.orderId));
    const totalAmount = items.reduce((sum, i) => sum + i.subtotal, 0);
    const pendingMergeItems = items.filter(
      (i) => MERGEABLE_SHIPMENT_STATUSES.includes(i.status) && !i.merged
    ).length;
    const pendingMarketplaceNumberShipments = shipmentsForTeacher.filter(
      (s) => s.pickupMethod !== "event_pickup" && !s.marketplaceOrderNumber
    ).length;

    return {
      teacherId: a.teacherId,
      teacherName: a.teacherName,
      preorderingProducts: preorderingByTeacher.get(a.teacherId) ?? 0,
      totalOrders: orderIds.size,
      pendingPaymentConfirmation: pendingPaymentOrderIds.size,
      pendingMergeItems,
      pendingMarketplaceNumberShipments,
      completedOrders: completedOrderIds.size,
      totalAmount,
    };
  });

  return {
    cards: {
      pendingPayments: pendingPaymentsResult.count ?? 0,
      unrepliedMessages: unrepliedMessagesResult.count ?? 0,
      preorderUnprocessedOrders: preorderUnprocessedResult.count ?? 0,
      artistUnprocessedOrders: artistUnprocessedResult.count ?? 0,
      mergeableItems,
      pendingListing: (pendingListingPreorderResult.count ?? 0) + (pendingListingArtistResult.count ?? 0),
      missingMarketplaceNumber,
      incompleteShipments,
    },
    finance: {
      preorder: {
        todayOrders: preorderTodayCount,
        monthOrders: preorderMonthCount,
        todayCompleted: preorderTodayCompleted,
        monthCompleted: preorderMonthCompleted,
      },
      artist: {
        todayOrders: artistTodayCount,
        monthOrders: artistMonthCount,
        todayCompleted: artistTodayCompleted,
        monthCompleted: artistMonthCompleted,
      },
    },
    artists,
    alerts: {
      unpaidAfterDeadline: unpaidAfterDeadlineOrderIds.size,
      arrivedNotShipped,
      listedMissingMarketplaceNumber,
      pendingSupplements,
      productsWithoutImage,
    },
  };
}
