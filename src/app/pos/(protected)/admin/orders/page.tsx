import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/pos-auth";
import { getAllPosEvents } from "@/lib/data/pos-events";
import { getAllArtistsWithEventName } from "@/lib/data/pos-artists";
import { getPosOrders } from "@/lib/data/pos-orders";
import { formatEventLabel } from "@/lib/pos-types";
import { GlassCard } from "@/components/pos/GlassCard";
import { PosOrderFilterForm } from "@/components/pos/admin/PosOrderFilterForm";
import { PosReturnButton } from "@/components/pos/admin/PosReturnButton";

export default async function PosAdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ eventId?: string; artistId?: string; dateFrom?: string; dateTo?: string }>;
}) {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/pos/login");
  const params = await searchParams;
  const [events, artists, orders] = await Promise.all([
    getAllPosEvents(),
    getAllArtistsWithEventName(),
    getPosOrders({
      eventId: params.eventId || undefined,
      artistId: params.artistId || undefined,
      dateFrom: params.dateFrom || undefined,
      dateTo: params.dateTo || undefined,
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={{ color: "var(--pos-gold)" }}>
          訂單管理
        </h1>
        <Link href="/pos/admin/settlement" className="text-sm underline" style={{ color: "var(--pos-gold)" }}>
          活動結算中心 →
        </Link>
      </div>

      <PosOrderFilterForm events={events} artists={artists} params={params} />

      <div className="flex flex-col gap-3">
        {orders.map((order) => (
          <GlassCard key={order.id}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--pos-glass-border)] pb-2 text-sm">
              <span className="font-mono font-bold" style={{ color: "var(--pos-gold)" }}>
                {order.orderNumber}
              </span>
              <span>
                {formatEventLabel({
                  name: order.eventName,
                  dayLabel: order.eventDayLabel,
                  boothNumber: order.eventBoothNumber,
                })}
              </span>
              <span>
                {order.sharedGroupId ? (
                  <span className="rounded px-1.5 py-0.5 text-xs" style={{ background: "var(--pos-gold)", color: "#1a1140" }}>
                    共用攤位・{order.sharedGroupName}
                  </span>
                ) : (
                  order.artistName
                )}
              </span>
              <span className="text-[var(--pos-text-muted)]">小幫手：{order.staffName ?? "-"}</span>
              <span className="text-[var(--pos-text-muted)]">{new Date(order.createdAt).toLocaleString("zh-TW")}</span>
              <PosReturnButton order={order} />
            </div>
            <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--pos-text-muted)]">
                  <th className="py-1">商品名稱</th>
                  <th className="py-1">數量</th>
                  <th className="py-1">單價</th>
                  <th className="py-1">小計</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-1">
                      {order.sharedGroupId && (
                        <span className="mr-1 text-xs text-[var(--pos-text-muted)]">
                          ［{item.artistName ?? order.artistName}］
                        </span>
                      )}
                      {item.groupName}
                      {item.variantName && <span> - {item.variantName}</span>}
                      {item.isFreebie && <span className="ml-1 text-xs text-[var(--pos-gold)]">（贈品）</span>}
                      {item.returnedQuantity > 0 && (
                        <span className="ml-1 text-xs text-red-400">
                          （已退 {item.returnedQuantity}/{item.quantity}）
                        </span>
                      )}
                    </td>
                    <td className="py-1">{item.quantity}</td>
                    <td className="py-1">NT$ {item.unitPrice}</td>
                    <td className="py-1">NT$ {item.subtotal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <div className="mt-2 flex flex-wrap justify-end gap-4 text-sm">
              <span>
                訂單總金額：<span className="font-semibold">NT$ {order.totalAmount}</span>
              </span>
              <span>收款：NT$ {order.receivedAmount}</span>
              <span>找零：NT$ {order.changeAmount}</span>
            </div>
          </GlassCard>
        ))}
        {orders.length === 0 && <p className="text-sm text-[var(--pos-text-muted)]">沒有符合條件的訂單</p>}
      </div>
    </div>
  );
}
