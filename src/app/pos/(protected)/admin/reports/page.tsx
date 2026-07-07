import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/pos-auth";
import { getAllPosEvents } from "@/lib/data/pos-events";
import { getAllArtistsWithEventName } from "@/lib/data/pos-artists";
import { getPosArtistReports } from "@/lib/data/pos-reports";
import { GlassCard } from "@/components/pos/GlassCard";
import { PosOrderFilterForm } from "@/components/pos/admin/PosOrderFilterForm";

export default async function PosAdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ eventId?: string; artistId?: string; dateFrom?: string; dateTo?: string }>;
}) {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/pos/login");
  const params = await searchParams;
  const filter = {
    eventId: params.eventId || undefined,
    artistId: params.artistId || undefined,
    dateFrom: params.dateFrom || undefined,
    dateTo: params.dateTo || undefined,
  };
  const [events, artists, reports] = await Promise.all([
    getAllPosEvents(),
    getAllArtistsWithEventName(),
    getPosArtistReports(filter),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--pos-gold)" }}>
          銷售報表
        </h1>
        <p className="text-sm text-[var(--pos-text-muted)]">來客數分析，用來評估每位繪師參加活動是否划算。</p>
      </div>

      <PosOrderFilterForm events={events} artists={artists} params={params} />

      <GlassCard>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--pos-text-muted)]">
                <th className="py-2">繪師</th>
                <th className="py-2">來客數</th>
                <th className="py-2">訂單數</th>
                <th className="py-2">銷售總金額</th>
                <th className="py-2">商品售出總數</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((row) => (
                <tr key={row.artistId} className="border-t border-[var(--pos-glass-border)]">
                  <td className="py-2">{row.artistName}</td>
                  <td className="py-2">{row.customerCount}</td>
                  <td className="py-2">{row.orderCount}</td>
                  <td className="py-2" style={{ color: "var(--pos-gold)" }}>
                    NT$ {row.totalSalesAmount}
                  </td>
                  <td className="py-2">{row.totalQuantitySold}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {reports.length === 0 && <p className="text-sm text-[var(--pos-text-muted)]">沒有符合條件的銷售資料</p>}
      </GlassCard>
    </div>
  );
}
