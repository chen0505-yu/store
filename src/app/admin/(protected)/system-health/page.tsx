import { getSystemHealthStats } from "@/lib/data/system-health";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-Hant", { timeZone: "Asia/Taipei", hour12: false });
}

export default async function AdminSystemHealthPage() {
  const stats = await getSystemHealthStats();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-purple-700">系統健康度</h1>
        <p className="mt-1 text-sm text-zinc-500">
          資料庫與 Storage 用量僅供參考，尚未串接 Supabase 方案上限，無法顯示「剩餘容量」或「安全／注意／接近上限」狀態。
        </p>
      </div>

      {!stats ? (
        <div className="rounded-2xl bg-orange-50 p-4 text-sm text-orange-600">
          尚未套用 <code>042_ops_dashboard_indexes.sql</code> / <code>043_system_health.sql</code> migration，或尚未設定 Supabase 環境變數，暫時無法讀取系統健康度資料。
        </div>
      ) : (
        <>
          <div className="rounded-2xl bg-amber-50 px-4 py-3 text-xs text-amber-700">
            方案上限尚未連接。以下數字只顯示目前實際用量，不會顯示假的剩餘容量或「安全／注意／接近上限」狀態。
            若要連接 Supabase Pro 方案額度／本月 egress，需要另外提供 Supabase Management API 的 Personal Access Token 與 Project Ref。
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-xs text-zinc-400">資料庫目前大小</p>
              <p className="mt-1 text-xl font-bold text-purple-700">
                {stats.databaseSizeBytes !== null ? `已使用 ${formatBytes(stats.databaseSizeBytes)}` : "尚未取得（需執行 migration 043）"}
              </p>
            </div>
            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-xs text-zinc-400">Storage 總容量</p>
              <p className="mt-1 text-xl font-bold text-purple-700">
                {formatBytes(stats.storageTotalBytes)}，共 {stats.storageTotalFiles.toLocaleString("zh-Hant")} 個檔案
              </p>
            </div>
            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-xs text-zinc-400">商品圖片</p>
              <p className="mt-1 text-xl font-bold text-purple-700">
                {formatBytes(stats.productImages.totalBytes)}，共 {stats.productImages.fileCount.toLocaleString("zh-Hant")} 張
              </p>
            </div>
            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-xs text-zinc-400">匯款截圖</p>
              <p className="mt-1 text-xl font-bold text-purple-700">
                {formatBytes(stats.paymentScreenshots.totalBytes)}，共 {stats.paymentScreenshots.fileCount.toLocaleString("zh-Hant")} 張
              </p>
            </div>
            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-xs text-zinc-400">合約／其他檔案</p>
              <p className="mt-1 text-xl font-bold text-purple-700">
                {formatBytes(stats.otherFiles.totalBytes)}，共 {stats.otherFiles.fileCount.toLocaleString("zh-Hant")} 個
              </p>
            </div>
            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-xs text-zinc-400">訂單總數／未完成訂單數</p>
              <p className="mt-1 text-xl font-bold text-purple-700">
                {stats.orderCount.toLocaleString("zh-Hant")} ／ {stats.incompleteOrderCount.toLocaleString("zh-Hant")}
              </p>
            </div>
            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-xs text-zinc-400">會員總數</p>
              <p className="mt-1 text-xl font-bold text-purple-700">{stats.memberCount.toLocaleString("zh-Hant")}</p>
            </div>
            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-xs text-zinc-400">繪師總數</p>
              <p className="mt-1 text-xl font-bold text-purple-700">{stats.artistCount.toLocaleString("zh-Hant")}</p>
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-purple-500">各資料夾容量明細</h2>
            <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 text-xs text-zinc-400">
                    <th className="px-4 py-3">資料夾</th>
                    <th className="px-4 py-3">檔案數</th>
                    <th className="px-4 py-3">容量</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.bucketBreakdown.map((b) => (
                    <tr key={b.folder} className="border-b border-zinc-50 last:border-0">
                      <td className="px-4 py-3">{b.folder}</td>
                      <td className="px-4 py-3">{b.fileCount.toLocaleString("zh-Hant")}</td>
                      <td className="px-4 py-3">{formatBytes(b.totalBytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs text-zinc-400">最後更新時間：{formatDateTime(stats.lastUpdated)}（每 30 分鐘重新整理一次，不會每次開頁都重新掃描 Storage）</p>
        </>
      )}
    </div>
  );
}
