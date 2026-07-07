"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PosEvent } from "@/lib/pos-types";
import { createPosEvent, updatePosEvent, setPosEventActive, deletePosEvent } from "@/lib/actions/pos-events";
import { GlassCard } from "@/components/pos/GlassCard";
import { GlowButton } from "@/components/pos/GlowButton";

interface EventFormFields {
  name: string;
  eventDate: string;
  dayLabel: string;
  boothNumber: string;
}

function emptyFields(): EventFormFields {
  return { name: "", eventDate: "", dayLabel: "", boothNumber: "" };
}

export function PosEventsAdmin({ events, canDelete }: { events: PosEvent[]; canDelete: boolean }) {
  const router = useRouter();
  const [fields, setFields] = useState<EventFormFields>(emptyFields());
  const [message, setMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<EventFormFields>(emptyFields());
  const [isPending, startTransition] = useTransition();

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createPosEvent({
        name: fields.name,
        eventDate: fields.eventDate || null,
        dayLabel: fields.dayLabel || null,
        boothNumber: fields.boothNumber || null,
      });
      setMessage(result.message);
      if (result.success) {
        setFields(emptyFields());
        router.refresh();
      }
    });
  }

  function startEdit(event: PosEvent) {
    setEditingId(event.id);
    setEditFields({
      name: event.name,
      eventDate: event.eventDate ?? "",
      dayLabel: event.dayLabel ?? "",
      boothNumber: event.boothNumber ?? "",
    });
  }

  function saveEdit(id: string) {
    startTransition(async () => {
      const result = await updatePosEvent(id, {
        name: editFields.name,
        eventDate: editFields.eventDate || null,
        dayLabel: editFields.dayLabel || null,
        boothNumber: editFields.boothNumber || null,
      });
      setMessage(result.message);
      if (result.success) {
        setEditingId(null);
        router.refresh();
      }
    });
  }

  function toggleActive(event: PosEvent) {
    startTransition(async () => {
      await setPosEventActive(event.id, !event.isActive);
      router.refresh();
    });
  }

  function remove(id: string) {
    if (!confirm("確定要刪除這個活動嗎？（底下的繪師、商品、訂單也會一併刪除）")) return;
    startTransition(async () => {
      const result = await deletePosEvent(id);
      setMessage(result.message);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--pos-gold)" }}>
          活動管理
        </h1>
        <p className="text-sm text-[var(--pos-text-muted)]">
          同時只會有一個「目前活動」，POS 前台會直接進入目前活動，不需要另外選活動。
        </p>
      </div>

      <GlassCard>
        <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--pos-text-muted)]">活動名稱</label>
            <input
              className="pos-input px-3 py-2 text-sm"
              value={fields.name}
              onChange={(e) => setFields((f) => ({ ...f, name: e.target.value }))}
              placeholder="例如 CWT69"
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--pos-text-muted)]">日期</label>
            <input
              type="date"
              className="pos-input px-3 py-2 text-sm"
              value={fields.eventDate}
              onChange={(e) => setFields((f) => ({ ...f, eventDate: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--pos-text-muted)]">Day</label>
            <input
              className="pos-input w-24 px-3 py-2 text-sm"
              value={fields.dayLabel}
              onChange={(e) => setFields((f) => ({ ...f, dayLabel: e.target.value }))}
              placeholder="Day1"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--pos-text-muted)]">攤位號</label>
            <input
              className="pos-input w-24 px-3 py-2 text-sm"
              value={fields.boothNumber}
              onChange={(e) => setFields((f) => ({ ...f, boothNumber: e.target.value }))}
              placeholder="A01"
            />
          </div>
          <GlowButton type="submit" disabled={isPending}>
            新增活動
          </GlowButton>
        </form>
        {message && <p className="mt-2 text-sm text-[var(--pos-gold)]">{message}</p>}
      </GlassCard>

      <div className="flex flex-col gap-2">
        {events.map((event) => (
          <GlassCard key={event.id} className="flex items-center justify-between gap-3">
            {editingId === event.id ? (
              <div className="flex flex-1 flex-wrap items-end gap-3">
                <input
                  className="pos-input px-3 py-2 text-sm"
                  value={editFields.name}
                  onChange={(e) => setEditFields((f) => ({ ...f, name: e.target.value }))}
                />
                <input
                  type="date"
                  className="pos-input px-3 py-2 text-sm"
                  value={editFields.eventDate}
                  onChange={(e) => setEditFields((f) => ({ ...f, eventDate: e.target.value }))}
                />
                <input
                  className="pos-input w-24 px-3 py-2 text-sm"
                  placeholder="Day1"
                  value={editFields.dayLabel}
                  onChange={(e) => setEditFields((f) => ({ ...f, dayLabel: e.target.value }))}
                />
                <input
                  className="pos-input w-24 px-3 py-2 text-sm"
                  placeholder="A01"
                  value={editFields.boothNumber}
                  onChange={(e) => setEditFields((f) => ({ ...f, boothNumber: e.target.value }))}
                />
                <button onClick={() => saveEdit(event.id)} className="pos-glow-btn px-3 py-1.5 text-sm">
                  儲存
                </button>
                <button onClick={() => setEditingId(null)} className="pos-input px-3 py-1.5 text-sm">
                  取消
                </button>
              </div>
            ) : (
              <div className="flex-1">
                <p className="font-semibold">
                  {event.name}
                  {event.dayLabel && <span> {event.dayLabel}</span>}
                  {event.boothNumber && (
                    <span className="ml-2 text-xs" style={{ color: "var(--pos-gold)" }}>
                      {event.boothNumber}
                    </span>
                  )}
                </p>
                <p className="text-xs text-[var(--pos-text-muted)]">{event.eventDate ?? "未設定日期"}</p>
              </div>
            )}
            <div className="flex shrink-0 items-center gap-2 text-sm">
              <span style={{ color: event.isActive ? "var(--pos-gold)" : "var(--pos-text-muted)" }}>
                {event.isActive ? "目前活動" : "未啟用"}
              </span>
              <button onClick={() => toggleActive(event)} className="pos-input px-3 py-1.5 text-xs">
                {event.isActive ? "停用" : "設為目前活動"}
              </button>
              {editingId !== event.id && (
                <button onClick={() => startEdit(event)} className="pos-input px-3 py-1.5 text-xs">
                  編輯
                </button>
              )}
              {canDelete && (
                <button onClick={() => remove(event.id)} className="px-3 py-1.5 text-xs text-red-400 hover:text-red-300">
                  刪除
                </button>
              )}
            </div>
          </GlassCard>
        ))}
        {events.length === 0 && <p className="text-sm text-[var(--pos-text-muted)]">尚未建立任何活動</p>}
      </div>
    </div>
  );
}
