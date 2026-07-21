import Link from "next/link";
import { getOpsDashboardStats } from "@/lib/data/ops-dashboard";
import { ClearTestDataButton } from "@/components/admin/ClearTestDataButton";

// 繪師總覽表格的「訂單總額」不在本次移除範圍內（使用者只要求移除營運統計區的今日／本月
// 金額卡片），保留這個 formatMoney 給那個欄位用。
function formatMoney(n: number) {
  return `NT$ ${n.toLocaleString("zh-Hant")}`;
}

export default async function AdminDashboardPage() {
  const stats = await getOpsDashboardStats();
  const isDevelopment = process.env.NODE_ENV === "development";

  // 8 張待處理事項卡片：點擊直接導向對應頁面並套用篩選條件（?filter=...），
  // 目標頁面在伺服器端讀 searchParams.filter 預先過濾好陣列，不用改動既有的
  // ShipmentItemMergeList／ShipmentList 等共用元件本身。
  const pendingCards = [
    { label: "待確認匯款", value: stats.cards.pendingPayments, href: "/admin/pending-payments" },
    { label: "未回覆留言", value: stats.cards.unrepliedMessages, href: "/admin/preorder-orders" },
    {
      label: "葴葴預購待處理訂單",
      value: stats.cards.preorderUnprocessedOrders,
      href: "/admin/preorder-orders?filter=unprocessed",
    },
    {
      label: "繪師預購待處理訂單",
      value: stats.cards.artistUnprocessedOrders,
      href: "/admin/artist-orders?filter=unprocessed",
    },
    { label: "可建立出貨訂單", value: stats.cards.mergeableItems, href: "/admin/preorder-orders?filter=mergeable" },
    { label: "待開賣場", value: stats.cards.pendingListing, href: "/admin/preorder-products?filter=packing" },
    {
      label: "待填賣貨便訂單編號",
      value: stats.cards.missingMarketplaceNumber,
      href: "/admin/shipments?filter=missing_marketplace_number",
    },
    { label: "待完成訂單", value: stats.cards.incompleteShipments, href: "/admin/shipments?filter=incomplete" },
  ];

  const financeRows: { key: "preorder" | "artist"; label: string }[] = [
    { key: "preorder", label: "葴葴預購" },
    { key: "artist", label: "繪師預購" },
  ];

  const alertItems = [
    { label: "預購已截止但仍有未匯款訂單", value: stats.alerts.unpaidAfterDeadline, href: "/admin/preorder-orders" },
    {
      label: "商品已到貨但尚未建立出貨單",
      value: stats.alerts.arrivedNotShipped,
      href: "/admin/preorder-orders?filter=mergeable",
    },
    {
      label: "已開賣場但尚未填賣貨便編號",
      value: stats.alerts.listedMissingMarketplaceNumber,
      href: "/admin/shipments?filter=missing_marketplace_number",
    },
    { label: "補款或二補尚未完成", value: stats.alerts.pendingSupplements, href: "/admin/supplements" },
    { label: "沒有圖片的商品", value: stats.alerts.productsWithoutImage, href: "/admin/preorder-products" },
  ].filter((a) => a.value > 0);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-bold text-purple-700">營運 Dashboard</h1>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-red-500">待處理事項</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {pendingCards.map((s) => (
            <Link
              key={s.label}
              href={s.href}
              className="rounded-3xl bg-white p-5 text-center shadow-sm transition hover:shadow-md hover:ring-2 hover:ring-red-200"
            >
              <p className="text-3xl font-bold text-red-500">{s.value}</p>
              <p className="mt-1 text-sm text-zinc-500">{s.label}</p>
            </Link>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-purple-500">營運統計</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {financeRows.map(({ key, label }) => {
            const f = stats.finance[key];
            return (
              <div key={key} className="flex flex-col gap-3 rounded-3xl bg-white p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-purple-700">{label}</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-zinc-400">今日新增訂單數</p>
                    <p className="text-lg font-bold text-purple-600">{f.todayOrders}</p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-400">本月新增訂單數</p>
                    <p className="text-lg font-bold text-purple-600">{f.monthOrders}</p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-400">今日完成訂單數</p>
                    <p className="text-lg font-bold text-purple-600">{f.todayCompleted}</p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-400">本月完成訂單數</p>
                    <p className="text-lg font-bold text-purple-600">{f.monthCompleted}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-purple-500">繪師總覽</h2>
        {stats.artists.length === 0 ? (
          <p className="rounded-2xl bg-white p-4 text-sm text-zinc-400">目前沒有繪師帳號</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-xs text-zinc-400">
                  <th className="px-4 py-3">繪師名稱</th>
                  <th className="px-4 py-3">預購中商品數</th>
                  <th className="px-4 py-3">訂單總數</th>
                  <th className="px-4 py-3">待確認匯款數</th>
                  <th className="px-4 py-3">待合併出貨數</th>
                  <th className="px-4 py-3">待填賣貨便編號數</th>
                  <th className="px-4 py-3">已完成訂單數</th>
                  <th className="px-4 py-3">訂單總額</th>
                </tr>
              </thead>
              <tbody>
                {stats.artists.map((a) => (
                  <tr key={a.teacherId} className="border-b border-zinc-50 last:border-0 hover:bg-purple-50/40">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/artist-orders?viewAs=${a.teacherId}`}
                        className="font-semibold text-purple-600 underline"
                      >
                        {a.teacherName}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{a.preorderingProducts}</td>
                    <td className="px-4 py-3">{a.totalOrders}</td>
                    <td className="px-4 py-3">{a.pendingPaymentConfirmation}</td>
                    <td className="px-4 py-3">{a.pendingMergeItems}</td>
                    <td className="px-4 py-3">{a.pendingMarketplaceNumberShipments}</td>
                    <td className="px-4 py-3">{a.completedOrders}</td>
                    <td className="px-4 py-3">{formatMoney(a.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {alertItems.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-orange-500">警示區</h2>
          <div className="flex flex-col gap-2">
            {alertItems.map((a) => (
              <Link
                key={a.label}
                href={a.href}
                className="flex items-center justify-between rounded-2xl bg-orange-50 px-4 py-3 text-sm text-orange-700 transition hover:bg-orange-100"
              >
                <span>{a.label}</span>
                <span className="font-bold">{a.value}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {isDevelopment && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-red-500">開發工具</h2>
          <ClearTestDataButton />
        </div>
      )}
    </div>
  );
}
