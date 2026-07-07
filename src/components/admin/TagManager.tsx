"use client";

import { useState, useTransition } from "react";
import type { Tag } from "@/lib/data/tags";
import { createTag, deleteTag, renameTag } from "@/lib/actions/tags";

function TagRow({ tag }: { tag: Tag }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tag.name);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      await renameTag(tag.id, name);
      setEditing(false);
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteTag(tag.id);
      if (result.inUse) {
        if (window.confirm(`${result.message} 確定要刪除嗎？`)) {
          const confirmedResult = await deleteTag(tag.id, true);
          setMessage(confirmedResult.success ? null : confirmedResult.message);
        }
      } else if (!result.success) {
        setMessage(result.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-1 rounded-2xl bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        {editing ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 rounded-lg border border-purple-200 px-2 py-1 text-sm"
          />
        ) : (
          <span className="text-sm text-zinc-700">#{tag.name}</span>
        )}
        <div className="flex items-center gap-2">
          {editing ? (
            <button
              onClick={handleSave}
              disabled={isPending}
              className="rounded-full bg-purple-500 px-3 py-1 text-xs text-white"
            >
              儲存
            </button>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="rounded-full bg-purple-50 px-3 py-1 text-xs text-purple-600"
            >
              編輯
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={isPending}
            className="rounded-full bg-red-50 px-3 py-1 text-xs text-red-500"
          >
            刪除
          </button>
        </div>
      </div>
      {message && <p className="text-xs text-red-500">{message}</p>}
    </div>
  );
}

export function TagManager({ tags }: { tags: Tag[] }) {
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createTag(name);
      setMessage(result.message);
      if (result.success) setName("");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleSubmit} className="flex gap-2 rounded-3xl bg-white p-4 shadow-sm">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="新增 Tag 名稱"
          className="flex-1 rounded-lg border border-purple-200 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-gradient-to-r from-pink-400 to-purple-400 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          新增
        </button>
      </form>
      {message && <p className="text-xs text-purple-600">{message}</p>}
      <div className="flex flex-col gap-2">
        {tags.map((tag) => (
          <TagRow key={tag.id} tag={tag} />
        ))}
      </div>
    </div>
  );
}
