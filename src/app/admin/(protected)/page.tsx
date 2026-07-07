import Link from "next/link";
import { getDashboardStats } from "@/lib/data/dashboard";
import { ClearTestDataButton } from "@/components/admin/ClearTestDataButton";

export default async function AdminDashboardPage() {
  const stats = await getDashboardStats();
  const isDevelopment = process.env.NODE_ENV === "development";

  const pendingStats = [
    { label: "未對帳數", value: stats.unreconciledPayments, href: "/admin/preorder-orders" },
    { label: "留言未回覆數", value: stats.unrepliedMessages, href: "/admin/preorder-orders" },
    { label: "預購訂單未處理數", value: stats.preorderUnprocessedOrders, href: "/admin/preorder-orders" },
    { label: "現貨訂單未處理數", value: stats.instockUnprocessedOrders, href: "/admin/instock-orders" },
    { label: "出貨訂單待處理數", value: stats.shipmentsNeedingAttention, href: "/admin/shipments" },
  ];

  const preorderStats = [
    { label: "預購中商品數", value: stats.preordering },
    { label: "未到貨商品數", value: stats.notArrived },
    { label: "已到台商品數", value: stats.arrived },
    { label: "整理中商品數", value: stats.packing },
    { label: "已開賣貨便商品數", value: stats.listed },
  ];

  const instockStats = [
    { label: "現貨商品數", value: stats.instockTotal },
    { label: "現貨售完商品數", value: stats.instockSoldOut },
    { label: "待處理現貨訂單數", value: stats.instockPendingOrders },
    { label: "已填賣貨便訂單編號的現貨訂單數", value: stats.instockFiledOrders },
  ];

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-bold text-purple-700">Dashboard</h1>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-red-500">待處理事項</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {pendingStats.map((s) => (
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
        <h2 className="mb-3 text-sm font-semibold text-purple-500">預購商品狀態</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {preorderStats.map((s) => (
            <div key={s.label} className="rounded-3xl bg-white p-5 text-center shadow-sm">
              <p className="text-3xl font-bold text-purple-600">{s.value}</p>
              <p className="mt-1 text-sm text-zinc-500">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-pink-500">現貨狀態</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {instockStats.map((s) => (
            <div key={s.label} className="rounded-3xl bg-white p-5 text-center shadow-sm">
              <p className="text-3xl font-bold text-pink-600">{s.value}</p>
              <p className="mt-1 text-sm text-zinc-500">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {isDevelopment && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-red-500">開發工具</h2>
          <ClearTestDataButton />
        </div>
      )}
    </div>
  );
}
