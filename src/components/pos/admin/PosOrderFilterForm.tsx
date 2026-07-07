import type { PosEvent } from "@/lib/pos-types";
import type { PosArtistWithEventName } from "@/lib/data/pos-artists";
import { GlassCard } from "@/components/pos/GlassCard";

// 依活動/繪師/日期篩選，用純 GET form（不需要 JS）導到同一頁帶查詢字串，
// 訂單管理、商品銷售統計、銷售報表共用同一個篩選表單。
export function PosOrderFilterForm({
  events,
  artists,
  params,
}: {
  events: PosEvent[];
  artists: PosArtistWithEventName[];
  params: { eventId?: string; artistId?: string; dateFrom?: string; dateTo?: string };
}) {
  return (
    <GlassCard>
      <form method="get" className="flex flex-wrap items-end gap-3 text-sm">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--pos-text-muted)]">活動</label>
          <select name="eventId" defaultValue={params.eventId ?? ""} className="pos-input px-3 py-2">
            <option value="" className="bg-[#1a1140]">
              全部
            </option>
            {events.map((event) => (
              <option key={event.id} value={event.id} className="bg-[#1a1140]">
                {event.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--pos-text-muted)]">繪師</label>
          <select name="artistId" defaultValue={params.artistId ?? ""} className="pos-input px-3 py-2">
            <option value="" className="bg-[#1a1140]">
              全部
            </option>
            {artists.map((artist) => (
              <option key={artist.id} value={artist.id} className="bg-[#1a1140]">
                {artist.eventName}／{artist.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--pos-text-muted)]">開始日期</label>
          <input type="date" name="dateFrom" defaultValue={params.dateFrom ?? ""} className="pos-input px-3 py-2" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--pos-text-muted)]">結束日期</label>
          <input type="date" name="dateTo" defaultValue={params.dateTo ?? ""} className="pos-input px-3 py-2" />
        </div>
        <button type="submit" className="pos-glow-btn px-4 py-2">
          篩選
        </button>
      </form>
    </GlassCard>
  );
}
