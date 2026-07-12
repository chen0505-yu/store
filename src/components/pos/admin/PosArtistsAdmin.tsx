"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PosEvent } from "@/lib/pos-types";
import type { PosArtistWithEventName } from "@/lib/data/pos-artists";
import { createPosArtist, updatePosArtist, setPosArtistActive, deletePosArtist } from "@/lib/actions/pos-artists";
import { GlassCard } from "@/components/pos/GlassCard";
import { GlowButton } from "@/components/pos/GlowButton";

export function PosArtistsAdmin({
  artists,
  events,
  canDelete,
}: {
  artists: PosArtistWithEventName[];
  events: PosEvent[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEventId, setEditEventId] = useState("");
  const [isPending, startTransition] = useTransition();
  // 預設只顯示啟用中的繪師，封存（已停用）的繪師收起來，避免列表被過去活動的
  // 舊繪師塞滿；點「顯示封存」可以看到並重新啟用。
  const [showArchived, setShowArchived] = useState(false);

  const visibleArtists = showArchived ? artists : artists.filter((a) => a.isActive);
  const archivedCount = artists.filter((a) => !a.isActive).length;

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createPosArtist({ eventId, name });
      setMessage(result.message);
      if (result.success) {
        setName("");
        router.refresh();
      }
    });
  }

  function startEdit(artist: PosArtistWithEventName) {
    setEditingId(artist.id);
    setEditName(artist.name);
    setEditEventId(artist.eventId);
  }

  function saveEdit(id: string) {
    startTransition(async () => {
      const result = await updatePosArtist(id, { eventId: editEventId, name: editName });
      setMessage(result.message);
      if (result.success) {
        setEditingId(null);
        router.refresh();
      }
    });
  }

  function toggleActive(artist: PosArtistWithEventName) {
    startTransition(async () => {
      await setPosArtistActive(artist.id, !artist.isActive);
      router.refresh();
    });
  }

  function remove(artist: PosArtistWithEventName) {
    const confirmMessage = artist.hasOrders
      ? "這位繪師已經有訂單，無法真正刪除，會改為封存（不會出現在 POS 前台與商品管理，但訂單/報表仍查得到）。確定要封存嗎？"
      : "確定要刪除這位繪師嗎？（底下的商品會一併刪除）";
    if (!confirm(confirmMessage)) return;
    startTransition(async () => {
      const result = await deletePosArtist(artist.id);
      setMessage(result.message);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold" style={{ color: "var(--pos-gold)" }}>
        繪師管理
      </h1>

      <GlassCard>
        {events.length === 0 ? (
          <p className="text-sm text-[var(--pos-text-muted)]">請先到「活動管理」建立活動，才能新增繪師。</p>
        ) : (
          <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[var(--pos-text-muted)]">所屬活動</label>
              <select
                className="pos-input px-3 py-2 text-sm"
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
              >
                {events.map((event) => (
                  <option key={event.id} value={event.id} className="bg-[#1a1140]">
                    {event.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[var(--pos-text-muted)]">繪師名稱</label>
              <input
                className="pos-input px-3 py-2 text-sm"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <GlowButton type="submit" disabled={isPending}>
              新增繪師
            </GlowButton>
          </form>
        )}
        {message && <p className="mt-2 text-sm text-[var(--pos-gold)]">{message}</p>}
      </GlassCard>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowArchived((v) => !v)}
          className="pos-input px-3 py-1.5 text-xs"
        >
          {showArchived ? "隱藏封存" : "顯示封存"}
          {archivedCount > 0 ? `（${archivedCount}）` : ""}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {visibleArtists.map((artist) => (
          <GlassCard key={artist.id} className="flex items-center justify-between gap-3">
            {editingId === artist.id ? (
              <div className="flex flex-1 flex-wrap items-end gap-3">
                <select
                  className="pos-input px-3 py-2 text-sm"
                  value={editEventId}
                  onChange={(e) => setEditEventId(e.target.value)}
                >
                  {events.map((event) => (
                    <option key={event.id} value={event.id} className="bg-[#1a1140]">
                      {event.name}
                    </option>
                  ))}
                </select>
                <input
                  className="pos-input px-3 py-2 text-sm"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
                <button onClick={() => saveEdit(artist.id)} className="pos-glow-btn px-3 py-1.5 text-sm">
                  儲存
                </button>
                <button onClick={() => setEditingId(null)} className="pos-input px-3 py-1.5 text-sm">
                  取消
                </button>
              </div>
            ) : (
              <div className="flex-1">
                <p className="font-semibold">
                  {artist.name} <span className="text-xs text-[var(--pos-text-muted)]">{artist.artistCode}</span>
                </p>
                <p className="text-xs text-[var(--pos-text-muted)]">{artist.eventName}</p>
              </div>
            )}
            <div className="flex shrink-0 items-center gap-2 text-sm">
              <span style={{ color: artist.isActive ? "var(--pos-gold)" : undefined }} className={artist.isActive ? "" : "text-[var(--pos-text-muted)]"}>
                {artist.isActive ? "啟用中" : "已停用"}
              </span>
              <button onClick={() => toggleActive(artist)} className="pos-input px-3 py-1.5 text-xs">
                {artist.isActive ? "停用" : "啟用"}
              </button>
              {editingId !== artist.id && (
                <button onClick={() => startEdit(artist)} className="pos-input px-3 py-1.5 text-xs">
                  編輯
                </button>
              )}
              {canDelete && (
                <button onClick={() => remove(artist)} className="px-3 py-1.5 text-xs text-red-400 hover:text-red-300">
                  {artist.hasOrders ? "封存" : "刪除"}
                </button>
              )}
            </div>
          </GlassCard>
        ))}
        {visibleArtists.length === 0 && (
          <p className="text-sm text-[var(--pos-text-muted)]">
            {showArchived ? "尚未建立任何繪師" : "沒有啟用中的繪師（可能都被封存了，點上面「顯示封存」查看）"}
          </p>
        )}
      </div>
    </div>
  );
}
