import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/pos-auth";
import { getAllPosEvents } from "@/lib/data/pos-events";
import { getAllArtistsWithEventName } from "@/lib/data/pos-artists";
import { getPosProductGroupStats } from "@/lib/data/pos-stats";
import { GlassCard } from "@/components/pos/GlassCard";
import { PosOrderFilterForm } from "@/components/pos/admin/PosOrderFilterForm";

export default async function PosAdminStatsPage({
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
  const [events, artists, groupStats] = await Promise.all([
    getAllPosEvents(),
    getAllArtistsWithEventName(),
    getPosProductGroupStats(filter),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--pos-gold)" }}>
          商品銷售統計
        </h1>
        <p className="text-sm text-[var(--pos-text-muted)]">
          現場來不及盤點庫存時，可以直接把「售出總數量」提供給繪師核對。細項（角色）不會出現在這裡，
          那個只在商品管理裡供你自己記錄、活動後盤點用。
        </p>
      </div>

      <PosOrderFilterForm events={events} artists={artists} params={params} />

      <GlassCard>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--pos-text-muted)]">
                <th className="py-2">繪師</th>
                <th className="py-2">商品主項</th>
                <th className="py-2">售出總數量</th>
                <th className="py-2">單價</th>
                <th className="py-2">銷售小計</th>
              </tr>
            </thead>
            <tbody>
              {groupStats.map((row, i) => (
                <tr key={i} className="border-t border-[var(--pos-glass-border)]">
                  <td className="py-2">{row.artistName}</td>
                  <td className="py-2">{row.groupName}</td>
                  <td className="py-2">{row.totalQuantity}</td>
                  <td className="py-2">NT$ {row.unitPrice}</td>
                  <td className="py-2">NT$ {row.subtotal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {groupStats.length === 0 && <p className="text-sm text-[var(--pos-text-muted)]">沒有符合條件的銷售資料</p>}
      </GlassCard>
    </div>
  );
}
