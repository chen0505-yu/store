"use client";

import { useState } from "react";
import type { PosEvent, PosArtist } from "@/lib/pos-types";
import { GlassCard } from "@/components/pos/GlassCard";

// 活動結算匯出：純 GET form 直接導到 /api/pos/settlement-export 下載檔案。
// 活動是必填，繪師可選「全部」或單一繪師，日期區間選填（不填就是整場活動全部訂單）。
// 繪師下拉選單要跟著目前選的活動連動（只顯示該活動底下的繪師），所以這裡需要一點點 client state。
export function PosSettlementExportPanel({ events, artists }: { events: PosEvent[]; artists: PosArtist[] }) {
  const defaultEventId = events.find((e) => e.isActive)?.id ?? events[0]?.id ?? "";
  const [eventId, setEventId] = useState(defaultEventId);

  const eventArtists = artists.filter((a) => a.eventId === eventId);

  return (
    <GlassCard>
      <h2 className="mb-1 text-lg font-semibold" style={{ color: "var(--pos-gold)" }}>
        活動結算匯出
      </h2>
      <p className="mb-3 text-xs text-[var(--pos-text-muted)]">
        匯出訂單明細、繪師銷售數量、繪師剩餘庫存（三個工作表），可以選全部繪師或單一繪師。
      </p>
      <form method="get" action="/api/pos/settlement-export" className="flex flex-wrap items-end gap-3 text-sm">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--pos-text-muted)]">活動</label>
          <select
            name="eventId"
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            className="pos-input px-3 py-2"
          >
            {events.map((event) => (
              <option key={event.id} value={event.id} className="bg-[#1a1140]">
                {event.name}
                {event.dayLabel ? ` ${event.dayLabel}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--pos-text-muted)]">繪師</label>
          <select name="artistId" defaultValue="" className="pos-input px-3 py-2">
            <option value="" className="bg-[#1a1140]">
              全部繪師
            </option>
            {eventArtists.map((artist) => (
              <option key={artist.id} value={artist.id} className="bg-[#1a1140]">
                {artist.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--pos-text-muted)]">開始日期（選填）</label>
          <input type="date" name="dateFrom" className="pos-input px-3 py-2" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--pos-text-muted)]">結束日期（選填）</label>
          <input type="date" name="dateTo" className="pos-input px-3 py-2" />
        </div>
        <button type="submit" className="pos-glow-btn px-6 py-2.5 text-base font-bold" disabled={events.length === 0}>
          匯出活動結算 Excel
        </button>
      </form>
      {events.length === 0 && <p className="mt-2 text-xs text-red-400">請先到「活動管理」建立活動</p>}
    </GlassCard>
  );
}
