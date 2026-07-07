"use client";

import { useState, useTransition } from "react";
import type { Announcement } from "@/lib/data/announcements";
import type { AnnouncementCategory } from "@/lib/types";
import {
  deleteAnnouncement,
  setAnnouncementArchived,
  updateAnnouncement,
} from "@/lib/actions/announcements";
import { ANNOUNCEMENT_CATEGORY_LABEL, ANNOUNCEMENT_CATEGORY_ORDER } from "@/lib/announcement-category";

export function AnnouncementRow({ announcement }: { announcement: Announcement }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(announcement.title);
  const [content, setContent] = useState(announcement.content);
  const [category, setCategory] = useState<AnnouncementCategory>(announcement.category);
  const [isPinned, setIsPinned] = useState(announcement.isPinned);
  const [isPublic, setIsPublic] = useState(announcement.isPublic);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      const result = await updateAnnouncement(announcement.id, title, content, category, isPinned, isPublic);
      setMessage(result.message);
      if (result.success) setEditing(false);
    });
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-lg border border-purple-200 px-3 py-2"
        />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          className="rounded-lg border border-purple-200 px-3 py-2"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as AnnouncementCategory)}
          className="w-fit rounded-lg border border-purple-200 px-3 py-2 text-sm"
        >
          {ANNOUNCEMENT_CATEGORY_ORDER.map((c) => (
            <option key={c} value={c}>
              {ANNOUNCEMENT_CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
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
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={isPending}
            className="rounded-full bg-purple-500 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            儲存
          </button>
          <button
            onClick={() => setEditing(false)}
            className="rounded-full bg-zinc-100 px-4 py-2 text-xs text-zinc-500"
          >
            取消
          </button>
        </div>
        {message && <p className="text-xs text-purple-600">{message}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-600">
          {ANNOUNCEMENT_CATEGORY_LABEL[announcement.category]}
        </span>
        {announcement.isPinned && (
          <span className="rounded-full bg-purple-500 px-2 py-0.5 text-xs text-white">置頂</span>
        )}
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${
            announcement.isPublic ? "bg-green-50 text-green-600" : "bg-zinc-100 text-zinc-500"
          }`}
        >
          {announcement.isPublic ? "公開" : "未公開"}
        </span>
        {announcement.isArchived && (
          <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-500">已封存</span>
        )}
        <p className="font-semibold text-zinc-800">{announcement.title}</p>
      </div>
      <p className="whitespace-pre-wrap text-sm text-zinc-600">{announcement.content}</p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setEditing(true)}
          className="rounded-full bg-purple-50 px-3 py-1 text-xs text-purple-600"
        >
          編輯
        </button>
        <button
          onClick={() =>
            startTransition(async () => {
              await setAnnouncementArchived(announcement.id, !announcement.isArchived);
            })
          }
          disabled={isPending}
          className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-600"
        >
          {announcement.isArchived ? "取消封存" : "封存"}
        </button>
        <button
          onClick={() => {
            if (!window.confirm("確定要永久刪除此公告嗎？此動作無法復原。")) return;
            startTransition(async () => {
              await deleteAnnouncement(announcement.id);
            });
          }}
          disabled={isPending}
          className="rounded-full bg-red-50 px-3 py-1 text-xs text-red-500"
        >
          刪除
        </button>
      </div>
      {message && <p className="text-xs text-purple-600">{message}</p>}
    </div>
  );
}
