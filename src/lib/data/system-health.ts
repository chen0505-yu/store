import { getSupabaseServerClient } from "@/lib/supabase/server";

const BUCKET = "litan-images";
// 快取多久才重新掃描一次 Storage／重新計算統計，避免每次開頁都大量列出 Storage 檔案。
const CACHE_TTL_MS = 30 * 60 * 1000;

// 依上傳時使用的 folder 前綴分類（見 src/lib/actions/upload.ts 呼叫端），
// 不在清單內的 folder 一律歸類到「其他檔案」，這樣未來新增 folder 也不會被漏算，
// 只是暫時歸類不精確，之後可以再擴充這個對照表。
const IMAGE_FOLDERS = ["products", "artist-products", "pos-products"];
const PAYMENT_FOLDERS = ["payments"];

export interface StorageBucketBreakdown {
  folder: string;
  fileCount: number;
  totalBytes: number;
}

export interface SystemHealthStats {
  databaseSizeBytes: number | null; // null 代表 RPC 尚未建立（migration 043 尚未執行）
  storageTotalBytes: number;
  storageTotalFiles: number;
  productImages: { fileCount: number; totalBytes: number };
  paymentScreenshots: { fileCount: number; totalBytes: number };
  otherFiles: { fileCount: number; totalBytes: number };
  bucketBreakdown: StorageBucketBreakdown[];
  orderCount: number;
  incompleteOrderCount: number;
  memberCount: number;
  artistCount: number;
  // 方案上限（Supabase Pro 額度／本月 egress 等）需要 Management API 才能取得，
  // 目前沒有串接，一律回傳 null，前端要顯示「方案上限尚未連接」，不能顯示假的剩餘容量。
  planLimitsConnected: false;
  lastUpdated: string;
}

interface StorageListEntry {
  name: string;
  id: string | null;
  metadata: { size?: number } | null;
}

async function listAllInFolder(
  supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>,
  folder: string
): Promise<StorageListEntry[]> {
  const all: StorageListEntry[] = [];
  let offset = 0;
  const limit = 1000;
  for (;;) {
    const { data, error } = await supabase.storage.from(BUCKET).list(folder, { limit, offset });
    if (error || !data || data.length === 0) break;
    all.push(...(data as StorageListEntry[]));
    if (data.length < limit) break;
    offset += limit;
  }
  return all;
}

// 掃描 Storage：先列出 bucket 根目錄找出所有資料夾（Supabase Storage 的資料夾在 list()
// 結果裡是 id 為 null 的項目），再逐一列出每個資料夾底下的檔案並加總大小/數量。
// 只掃一層，因為目前所有上傳路徑都是「folder/檔名」的單層結構（見 uploadImage）。
async function scanStorage(
  supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>
): Promise<{ breakdown: StorageBucketBreakdown[]; totalBytes: number; totalFiles: number }> {
  const rootEntries = await listAllInFolder(supabase, "");
  const folders = rootEntries.filter((e) => e.id === null).map((e) => e.name);

  const breakdown: StorageBucketBreakdown[] = [];
  let totalBytes = 0;
  let totalFiles = 0;

  for (const folder of folders) {
    const files = await listAllInFolder(supabase, folder);
    const realFiles = files.filter((f) => f.id !== null);
    const folderBytes = realFiles.reduce((sum, f) => sum + (f.metadata?.size ?? 0), 0);
    breakdown.push({ folder, fileCount: realFiles.length, totalBytes: folderBytes });
    totalBytes += folderBytes;
    totalFiles += realFiles.length;
  }

  return { breakdown, totalBytes, totalFiles };
}

async function computeSystemHealthStats(
  supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>
): Promise<SystemHealthStats> {
  const [dbSizeResult, storageResult, orderCountResult, incompleteOrderResult, memberCountResult, artistCountResult] =
    await Promise.all([
      supabase.rpc("get_database_size_bytes"),
      scanStorage(supabase),
      supabase.from("orders").select("id", { count: "exact", head: true }),
      supabase.from("orders").select("id", { count: "exact", head: true }).neq("status", "completed"),
      supabase.from("members").select("id", { count: "exact", head: true }),
      supabase.from("teachers").select("id", { count: "exact", head: true }).eq("is_artist_shop", true),
    ]);

  const byFolder = new Map(storageResult.breakdown.map((b) => [b.folder, b]));
  const sumFolders = (names: string[]) =>
    names.reduce(
      (acc, name) => {
        const b = byFolder.get(name);
        if (b) {
          acc.fileCount += b.fileCount;
          acc.totalBytes += b.totalBytes;
        }
        return acc;
      },
      { fileCount: 0, totalBytes: 0 }
    );

  const productImages = sumFolders(IMAGE_FOLDERS);
  const paymentScreenshots = sumFolders(PAYMENT_FOLDERS);
  const knownFolders = new Set([...IMAGE_FOLDERS, ...PAYMENT_FOLDERS]);
  const otherFiles = storageResult.breakdown
    .filter((b) => !knownFolders.has(b.folder))
    .reduce(
      (acc, b) => {
        acc.fileCount += b.fileCount;
        acc.totalBytes += b.totalBytes;
        return acc;
      },
      { fileCount: 0, totalBytes: 0 }
    );

  return {
    databaseSizeBytes: dbSizeResult.error ? null : (dbSizeResult.data as number),
    storageTotalBytes: storageResult.totalBytes,
    storageTotalFiles: storageResult.totalFiles,
    productImages,
    paymentScreenshots,
    otherFiles,
    bucketBreakdown: storageResult.breakdown,
    orderCount: orderCountResult.count ?? 0,
    incompleteOrderCount: incompleteOrderResult.count ?? 0,
    memberCount: memberCountResult.count ?? 0,
    artistCount: artistCountResult.count ?? 0,
    planLimitsConnected: false,
    lastUpdated: new Date().toISOString(),
  };
}

export async function getSystemHealthStats(): Promise<SystemHealthStats | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const { data: cached } = await supabase.from("system_health_cache").select("stats, updated_at").eq("id", 1).maybeSingle();

  if (cached && Date.now() - new Date(cached.updated_at).getTime() < CACHE_TTL_MS) {
    return cached.stats as SystemHealthStats;
  }

  const stats = await computeSystemHealthStats(supabase);
  await supabase
    .from("system_health_cache")
    .upsert({ id: 1, stats, updated_at: stats.lastUpdated });

  return stats;
}
