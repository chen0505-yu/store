import type { SupabaseClient } from "@supabase/supabase-js";

// 品項（product_groups／artist_product_groups）永久刪除前的安全檢查，兩個垂直共用同一套邏輯，
// 只是資料表/欄位名稱不同。目前平台沒有任何「複製品項」功能會讓兩個不同品項共用同一張
// Storage 圖片（上傳一律用亂數 UUID 檔名，見 src/lib/actions/upload.ts），所以「圖片是否被
// 其他品項引用」只需要檢查同一個垂直內是否有其他品項的 image_url 剛好相同即可。
export type GroupKind = "preorder" | "artist";

interface GroupTableConfig {
  groupTable: "product_groups" | "artist_product_groups";
  imageTable: "product_group_images" | "artist_product_group_images";
  imageGroupColumn: "product_group_id" | "artist_product_group_id";
  orderItemGroupColumn: "product_group_id" | "artist_group_id";
}

const CONFIGS: Record<GroupKind, GroupTableConfig> = {
  preorder: {
    groupTable: "product_groups",
    imageTable: "product_group_images",
    imageGroupColumn: "product_group_id",
    orderItemGroupColumn: "product_group_id",
  },
  artist: {
    groupTable: "artist_product_groups",
    imageTable: "artist_product_group_images",
    imageGroupColumn: "artist_product_group_id",
    orderItemGroupColumn: "artist_group_id",
  },
};

export interface GroupDeletePreview {
  canDelete: boolean;
  blockReason: string | null;
  imageUrlsToDelete: string[];
  imageUrlsKeptShared: string[];
}

const GROUP_HAS_UNFINISHED_MESSAGE = "此品項仍有未完成訂單／未合併出貨的品項，無法永久刪除。";
const GROUP_HAS_PENDING_SUPPLEMENT_MESSAGE = "此品項所屬訂單仍有待處理的補款／二補，無法永久刪除。";

async function getGroupBlockReason(
  supabase: SupabaseClient,
  config: GroupTableConfig,
  groupId: string
): Promise<string | null> {
  const { data: orderItems } = await supabase
    .from("order_items")
    .select("id, order_id")
    .eq(config.orderItemGroupColumn, groupId);

  const items = orderItems ?? [];
  if (items.length === 0) return null;

  const orderItemIds = items.map((i) => i.id);
  const orderIds = Array.from(new Set(items.map((i) => i.order_id)));

  const [{ data: shipmentItems }, { data: pendingSupplements }] = await Promise.all([
    supabase.from("shipment_items").select("status").in("order_item_id", orderItemIds),
    supabase.from("supplements").select("id").in("order_id", orderIds).eq("status", "pending"),
  ]);

  const hasUnfinished = (shipmentItems ?? []).some((si) => si.status !== "completed");
  if (hasUnfinished) return GROUP_HAS_UNFINISHED_MESSAGE;
  if ((pendingSupplements ?? []).length > 0) return GROUP_HAS_PENDING_SUPPLEMENT_MESSAGE;
  return null;
}

async function getGroupOwnImageUrls(
  supabase: SupabaseClient,
  config: GroupTableConfig,
  groupId: string
): Promise<string[]> {
  const [{ data: groupRow }, { data: imageRows }] = await Promise.all([
    supabase.from(config.groupTable).select("image_url").eq("id", groupId).maybeSingle(),
    supabase.from(config.imageTable).select("image_url").eq(config.imageGroupColumn, groupId),
  ]);

  const urls = new Set<string>();
  if (groupRow?.image_url) urls.add(groupRow.image_url);
  for (const row of imageRows ?? []) {
    if (row.image_url) urls.add(row.image_url);
  }
  return Array.from(urls);
}

// 檢查這些圖片網址是否還被「同一垂直內的其他品項」引用，只有完全沒被引用的才可以真的
// 從 Storage 刪除；被引用的網址保留在 Storage（DB 那邊的品項紀錄本來就會被刪除，不影響）。
async function splitSharedImageUrls(
  supabase: SupabaseClient,
  config: GroupTableConfig,
  groupId: string,
  urls: string[]
): Promise<{ toDelete: string[]; keptShared: string[] }> {
  if (urls.length === 0) return { toDelete: [], keptShared: [] };

  const [{ data: otherGroupRows }, { data: otherImageRows }] = await Promise.all([
    supabase.from(config.groupTable).select("image_url").in("image_url", urls).neq("id", groupId),
    supabase.from(config.imageTable).select("image_url").in("image_url", urls).neq(config.imageGroupColumn, groupId),
  ]);

  const sharedUrls = new Set<string>();
  for (const row of otherGroupRows ?? []) {
    if (row.image_url) sharedUrls.add(row.image_url);
  }
  for (const row of otherImageRows ?? []) {
    if (row.image_url) sharedUrls.add(row.image_url);
  }

  return {
    toDelete: urls.filter((u) => !sharedUrls.has(u)),
    keptShared: urls.filter((u) => sharedUrls.has(u)),
  };
}

export async function getGroupDeletePreview(
  supabase: SupabaseClient,
  kind: GroupKind,
  groupId: string
): Promise<GroupDeletePreview> {
  const config = CONFIGS[kind];
  const blockReason = await getGroupBlockReason(supabase, config, groupId);
  const ownUrls = await getGroupOwnImageUrls(supabase, config, groupId);
  const { toDelete, keptShared } = await splitSharedImageUrls(supabase, config, groupId, ownUrls);

  return {
    canDelete: !blockReason,
    blockReason,
    imageUrlsToDelete: toDelete,
    imageUrlsKeptShared: keptShared,
  };
}

// 從公開網址反推 Storage 路徑（bucket 底下的 folder/檔名），uploadImage 產生的網址一律是
// getPublicUrl 回傳的標準格式，路徑就是 .../object/public/<bucket>/<path> 之後的部分。
export function extractStoragePath(publicUrl: string, bucket: string): string | null {
  const marker = `/object/public/${bucket}/`;
  const index = publicUrl.indexOf(marker);
  if (index === -1) return null;
  return publicUrl.slice(index + marker.length);
}

export async function permanentlyDeleteGroup(
  supabase: SupabaseClient,
  kind: GroupKind,
  groupId: string
): Promise<{ success: boolean; message: string; deletedImageUrls: string[] }> {
  const config = CONFIGS[kind];
  const preview = await getGroupDeletePreview(supabase, kind, groupId);
  if (!preview.canDelete) {
    return { success: false, message: preview.blockReason ?? "無法刪除", deletedImageUrls: [] };
  }

  // product_variants / product_group_images 都是 on delete cascade，刪這一筆品項會自動連帶清除；
  // order_items 的 product_group_id / artist_group_id 是 on delete set null，歷史訂單快照不受影響。
  const { error } = await supabase.from(config.groupTable).delete().eq("id", groupId);
  if (error) return { success: false, message: error.message, deletedImageUrls: [] };

  const BUCKET = "litan-images";
  const paths = preview.imageUrlsToDelete
    .map((url) => extractStoragePath(url, BUCKET))
    .filter((p): p is string => Boolean(p));
  if (paths.length > 0) {
    await supabase.storage.from(BUCKET).remove(paths);
  }

  return { success: true, message: "已永久刪除品項", deletedImageUrls: preview.imageUrlsToDelete };
}
