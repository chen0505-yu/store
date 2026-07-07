"use client";

import { useState, useTransition } from "react";
import type { InstockSettings } from "@/lib/product-availability";
import { updateInstockSettings } from "@/lib/actions/instock-settings";
import { toLocalInputValue, fromLocalInputValue } from "@/lib/datetime";

export function InstockSettingsForm({ settings }: { settings: InstockSettings | null }) {
  const [isOpen, setIsOpen] = useState(settings?.isOpen ?? false);
  const [startsAt, setStartsAt] = useState(toLocalInputValue(settings?.startsAt ?? null));
  const [endsAt, setEndsAt] = useState(toLocalInputValue(settings?.endsAt ?? null));
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await updateInstockSettings({
        isOpen,
        startsAt: fromLocalInputValue(startsAt),
        endsAt: fromLocalInputValue(endsAt),
      });
      setMessage(result.message);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-3xl bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-zinc-700">現貨區狀態</label>
        <button
          type="button"
          onClick={() => setIsOpen((v) => !v)}
          className={`rounded-full px-4 py-2 text-sm font-semibold ${
            isOpen ? "bg-green-100 text-green-700" : "bg-zinc-100 text-zinc-500"
          }`}
        >
          {isOpen ? "開放" : "關閉"}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-500">現貨開放開始時間</label>
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className="rounded-lg border border-pink-200 px-3 py-2"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-500">現貨開放結束時間</label>
          <input
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            className="rounded-lg border border-pink-200 px-3 py-2"
          />
        </div>
      </div>
      <p className="text-xs text-zinc-400">
        開始/結束時間留空代表不限制。只有「開放」且在時間範圍內，客人才能下單。
      </p>

      <button
        type="submit"
        disabled={isPending}
        className="self-start rounded-full bg-gradient-to-r from-pink-400 to-purple-400 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {isPending ? "儲存中..." : "儲存設定"}
      </button>
      {message && <p className="text-xs text-pink-600">{message}</p>}
    </form>
  );
}
