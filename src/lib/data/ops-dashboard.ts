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
  todayAmount: number;
  monthOrders: number;
  monthAmount: number;
  todayCompleted: number; // 今日完成訂單數：以「今日完成的出貨單數」近似，一張出貨單可能合併多筆訂單
  monthCompleted: number;
  outstandingAmount: number; // 未收款總額：尚未確認匯款訂單的（訂單總額－已匯款金額）加總
  pendingSupplementAmount: number; // 補款／二補待收總額：狀態為 pending 的補款金額加總
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
  todayAmount: 0,
  monthOrders: 0,
  monthAmount: 0,
  todayCompleted: 0,
  monthCompleted: 0,
  outstandingAmount: 0,
  pendingSupplementAmount: 0,
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

// 一次查完「今日／本月訂單數與金額」：直接抓 total_amount 欄位而不是先 count 再另外 sum，
// 一個查詢同時拿到筆數（rows.length）跟金額加總，避免同一個時間區間重複查兩次。
async function fetchOrdersCountAndAmount(
  supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>,
  orderType: "preorder" | "artist",
  sinceISO: string
): Promise<{ count: number; amount: number }> {
  const { data } = await supabase
    .from("orders")
    .select("total_amount")
    .eq("order_type", orderType)
    .gte("created_at", sinceISO);
  const rows = data ?? [];
  return { count: rows.length, amount: rows.reduce((sum, r) => sum + Number(r.total_amount), 0) };
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

// 未收款總額：只算還沒確認匯款完成的訂單（not_remitted／pending_confirmation／underpaid），
// 每筆訂單的未收金額＝訂單總額－已匯款金額（沒匯款資料視為 0），加總後回傳。
// 只查這個子集合（通常遠小於全部訂單），不是撈全部訂單回來在伺服器端過濾全部資料。
async function fetchOutstandingAmount(
  supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>,
  orderType: "preorder" | "artist"
): Promise<number> {
  const { data: orders } = await supabase
    .from("orders")
    .select("id, total_amount")
    .eq("order_type", orderType)
    .in("payment_status", ["not_remitted", "pending_confirmation", "underpaid"]);
  const rows = orders ?? [];
  if (rows.length === 0) return 0;

  const orderIds = rows.map((o) => o.id);
  const { data: payments } = await supabase
    .from("payments")
    .select("order_id, actual_amount")
    .in("order_id", orderIds);
  const actualByOrderId = new Map((payments ?? []).map((p) => [p.order_id, Number(p.actual_amount ?? 0)]));

  return rows.reduce((sum, o) => {
    const actual = actualByOrderId.get(o.id) ?? 0;
    return sum + Math.max(0, Number(o.total_amount) - actual);
  }, 0);
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
    preorderTodayResult,
    preorderMonthResult,
    artistTodayResult,
    artistMonthResult,
    preorderTodayCompleted,
    preorderMonthCompleted,
    artistTodayCompleted,
    artistMonthCompleted,
    preorderOutstanding,
    artistOutstanding,
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
    supabase.from("supplements").select("order_id, amount").eq("status", "pending"),
    fetchOrdersCountAndAmount(supabase, "preorder", todayStart),
    fetchOrdersCountAndAmount(supabase, "preorder", monthStart),
    fetchOrdersCountAndAmount(supabase, "artist", todayStart),
    fetchOrdersCountAndAmount(supabase, "artist", monthStart),
    fetchCompletedShipmentCount(supabase, "preorder", todayStart),
    fetchCompletedShipmentCount(supabase, "preorder", monthStart),
    fetchCompletedShipmentCount(supabase, "artist", todayStart),
    fetchCompletedShipmentCount(supabase, "artist", monthStart),
    fetchOutstandingAmount(supabase, "preorder"),
    fetchOutstandingAmount(supabase, "artist"),
  ]);

  // 補款／二補待收總額：抓一次全部 pending 補款，再依訂單所屬 order_type 分兩邊加總，
  // 不用各跑一次查詢（supplements 表本身沒有 order_type 欄位，要反查 orders）。
  const pendingSupplementRows = pendingSupplementsResult.data ?? [];
  let preorderPendingSupplementAmount = 0;
  let artistPendingSupplementAmount = 0;
  if (pendingSupplementRows.length > 0) {
    const supplementOrderIds = Array.from(new Set(pendingSupplementRows.map((s) => s.order_id)));
    const { data: supplementOrders } = await supabase
      .from("orders")
      .select("id, order_type")
      .in("id", supplementOrderIds);
    const orderTypeById = new Map((supplementOrders ?? []).map((o) => [o.id, o.order_type]));
    for (const s of pendingSupplementRows) {
      const type = orderTypeById.get(s.order_id);
      if (type === "preorder") preorderPendingSupplementAmount += Number(s.amount);
      else if (type === "artist") artistPendingSupplementAmount += Number(s.amount);
    }
  }

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
  const pendingSupplements = pendingSupplementRows.length;

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
        todayOrders: preorderTodayResult.count,
        todayAmount: preorderTodayResult.amount,
        monthOrders: preorderMonthResult.count,
        monthAmount: preorderMonthResult.amount,
        todayCompleted: preorderTodayCompleted,
        monthCompleted: preorderMonthCompleted,
        outstandingAmount: preorderOutstanding,
        pendingSupplementAmount: preorderPendingSupplementAmount,
      },
      artist: {
        todayOrders: artistTodayResult.count,
        todayAmount: artistTodayResult.amount,
        monthOrders: artistMonthResult.count,
        monthAmount: artistMonthResult.amount,
        todayCompleted: artistTodayCompleted,
        monthCompleted: artistMonthCompleted,
        outstandingAmount: artistOutstanding,
        pendingSupplementAmount: artistPendingSupplementAmount,
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
