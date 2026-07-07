"use client";

import { useState, useTransition } from "react";
import type { AdminEventPickupOption } from "@/lib/data/admin-teacher-shops";
import {
  addEventPickupOption,
  deleteEventPickupOption,
  setTeacherEventPickupEnabled,
  toggleEventPickupOptionActive,
} from "@/lib/actions/teachers";

// 活動現場取貨（CWT/FF/布穀町/NiCE 等）：開放與否是老師層級設定，開放後可以新增多個場次選項，
// 例如「FF 第一天」「FF 第二天」，客人下單時可以選擇要現場取貨還是走原本的賣貨便配送。
export function TeacherEventPickupSettings({
  teacherId,
  allowEventPickup,
  options,
}: {
  teacherId: string;
  allowEventPickup: boolean;
  options: AdminEventPickupOption[];
}) {
  const [enabled, setEnabled] = useState(allowEventPickup);
  const [eventName, setEventName] = useState("");
  const [sessionName, setSessionName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleToggleEnabled() {
    const next = !enabled;
    setEnabled(next);
    startTransition(async () => {
      const result = await setTeacherEventPickupEnabled(teacherId, next);
      setMessage(result.message);
    });
  }

  function handleAddOption() {
    if (!eventName.trim() || !displayName.trim()) return;
    startTransition(async () => {
      const result = await addEventPickupOption(teacherId, { eventName, sessionName, displayName });
      if (result.success) {
        setEventName("");
        setSessionName("");
        setDisplayName("");
      }
      setMessage(result.message);
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-purple-50/60 p-3">
      <label className="flex items-center gap-2 text-xs font-semibold text-purple-600">
        <input type="checkbox" checked={enabled} onChange={handleToggleEnabled} disabled={isPending} />
        開放活動現場取貨（CWT／FF／布穀町／NiCE 等，客人下單時可選擇現場取貨場次）
      </label>

      {enabled && (
        <div className="flex flex-col gap-2">
          {options.length > 0 && (
            <div className="flex flex-col gap-1">
              {options.map((opt) => (
                <div
                  key={opt.id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-1.5 text-xs"
                >
                  <span className={opt.isActive ? "text-zinc-700" : "text-zinc-400 line-through"}>
                    {opt.displayName}（{opt.eventName}
                    {opt.sessionName ? `・${opt.sessionName}` : ""}）
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        startTransition(async () => {
                          await toggleEventPickupOptionActive(opt.id, !opt.isActive);
                        })
                      }
                      disabled={isPending}
                      className="text-purple-500 underline"
                    >
                      {opt.isActive ? "停用" : "啟用"}
                    </button>
                    <button
                      onClick={() => {
                        if (!window.confirm("確定要刪除此取貨選項嗎？")) return;
                        startTransition(async () => {
                          await deleteEventPickupOption(opt.id);
                        });
                      }}
                      disabled={isPending}
                      className="text-red-500 underline"
                    >
                      刪除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <input
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              placeholder="活動名稱，例如 FF"
              className="rounded-lg border border-purple-200 px-2 py-1 text-xs"
            />
            <input
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              placeholder="場次，例如 第一天"
              className="rounded-lg border border-purple-200 px-2 py-1 text-xs"
            />
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="顯示名稱，例如 FF 第一天"
              className="rounded-lg border border-purple-200 px-2 py-1 text-xs"
            />
          </div>
          <button
            onClick={handleAddOption}
            disabled={isPending || !eventName.trim() || !displayName.trim()}
            className="w-fit rounded-full bg-purple-500 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            新增取貨選項
          </button>
        </div>
      )}
      {message && <p className="text-xs text-purple-600">{message}</p>}
    </div>
  );
}
