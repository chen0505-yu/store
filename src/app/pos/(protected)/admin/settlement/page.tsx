import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/pos-auth";
import { getAllPosEvents } from "@/lib/data/pos-events";
import { getAllArtistsWithEventName } from "@/lib/data/pos-artists";
import { getPosArtistReports } from "@/lib/data/pos-reports";
import { GlassCard } from "@/components/pos/GlassCard";
import { PosSettlementExportPanel } from "@/components/pos/admin/PosSettlementExportPanel";

// 活動結算中心：把每場活動結束後需要用的匯出都集中在這裡，不分散在其他頁面。
// 另外顯示活動總覽（後台看，不匯出）：總訂單數/來客數/總銷售件數/總金額。
export default async function PosAdminSettlementPage({
  searchParams,
}: {
  searchParams: Promise<{ eventId?: string }>;
}) {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/pos/login");
  const { eventId: requestedEventId } = await searchParams;
  const events = await getAllPosEvents();
  const artists = await getAllArtistsWithEventName();

  const summaryEventId = requestedEventId || events.find((e) => e.isActive)?.id || events[0]?.id || "";
  const summaryEvent = events.find((e) => e.id === summaryEventId) ?? null;
  const reports = summaryEventId ? await getPosArtistReports({ eventId: summaryEventId }) : [];

  const totalOrders = reports.reduce((sum, r) => sum + r.orderCount, 0);
  const totalCustomers = reports.reduce((sum, r) => sum + r.customerCount, 0);
  const totalQuantity = reports.reduce((sum, r) => sum + r.totalQuantitySold, 0);
  const totalAmount = reports.reduce((sum, r) => sum + r.totalSalesAmount, 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--pos-gold)" }}>
          活動結算中心
        </h1>
        <p className="text-sm text-[var(--pos-text-muted)]">每場活動結束後要用的匯出都在這裡，一次搞定。</p>
      </div>

      <GlassCard>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-semibold" style={{ color: "var(--pos-gold)" }}>
            活動總覽
          </h2>
          <form method="get" action="/pos/admin/settlement" className="flex items-end gap-2 text-sm">
            <select name="eventId" defaultValue={summaryEventId} className="pos-input px-3 py-2">
              {events.map((event) => (
                <option key={event.id} value={event.id} className="bg-[#1a1140]">
                  {event.name}
                  {event.dayLabel ? ` ${event.dayLabel}` : ""}
                </option>
              ))}
            </select>
            <button type="submit" className="pos-input px-4 py-2">
              顯示
            </button>
          </form>
        </div>

        {!summaryEvent ? (
          <p className="text-sm text-[var(--pos-text-muted)]">請先到「活動管理」建立活動</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div className="pos-input p-3 text-center">
              <p className="text-xs text-[var(--pos-text-muted)]">活動名稱</p>
              <p className="mt-1 text-lg font-bold">
                {summaryEvent.name}
                {summaryEvent.dayLabel ? ` ${summaryEvent.dayLabel}` : ""}
              </p>
            </div>
            <div className="pos-input p-3 text-center">
              <p className="text-xs text-[var(--pos-text-muted)]">總訂單數</p>
              <p className="mt-1 text-lg font-bold">{totalOrders}</p>
            </div>
            <div className="pos-input p-3 text-center">
              <p className="text-xs text-[var(--pos-text-muted)]">來客數</p>
              <p className="mt-1 text-lg font-bold">{totalCustomers}</p>
            </div>
            <div className="pos-input p-3 text-center">
              <p className="text-xs text-[var(--pos-text-muted)]">總銷售件數</p>
              <p className="mt-1 text-lg font-bold">{totalQuantity}</p>
            </div>
            <div className="pos-input p-3 text-center">
              <p className="text-xs text-[var(--pos-text-muted)]">總金額</p>
              <p className="mt-1 text-lg font-bold" style={{ color: "var(--pos-gold)" }}>
                NT$ {totalAmount}
              </p>
            </div>
          </div>
        )}
      </GlassCard>

      <PosSettlementExportPanel events={events} artists={artists} />
    </div>
  );
}
