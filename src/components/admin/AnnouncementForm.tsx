"use client";

import { useState, useTransition } from "react";
import type { AnnouncementCategory } from "@/lib/types";
import { createAnnouncement } from "@/lib/actions/announcements";
import { ANNOUNCEMENT_CATEGORY_LABEL, ANNOUNCEMENT_CATEGORY_ORDER } from "@/lib/announcement-category";

export function AnnouncementForm() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<AnnouncementCategory>("news");
  const [isPinned, setIsPinned] = useState(false);
  const [isPublic, setIsPublic] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createAnnouncement(title, content, category, isPinned, isPublic);
      setMessage(result.message);
      if (result.success) {
        setTitle("");
        setContent("");
        setCategory("news");
        setIsPinned(false);
        setIsPublic(true);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-3xl bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-500">標題 *</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="rounded-lg border border-purple-200 px-3 py-2"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-500">內容</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          className="rounded-lg border border-purple-200 px-3 py-2"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-500">分類</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as AnnouncementCategory)}
          className="w-fit rounded-lg border border-purple-200 px-3 py-2"
        >
          {ANNOUNCEMENT_CATEGORY_ORDER.map((c) => (
            <option key={c} value={c}>
              {ANNOUNCEMENT_CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={isPinned} onChange={(e) => setIsPinned(e.target.checked)} />
          置頂
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
          公開
        </label>
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="self-start rounded-full bg-gradient-to-r from-pink-400 to-purple-400 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {isPending ? "新增中..." : "新增公告"}
      </button>
      {message && <p className="text-xs text-purple-600">{message}</p>}
    </form>
  );
}
