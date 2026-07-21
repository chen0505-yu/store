"use client";

import { useState, useTransition } from "react";
import type { ArchivedGroupRow as ArchivedGroupRowData } from "@/lib/data/archived-groups";
import type { GroupDeletePreview } from "@/lib/product-group-delete";

export interface ArchivedGroupActions {
  restore: (groupId: string) => Promise<{ success: boolean; message: string }>;
  getDeletePreview: (groupId: string) => Promise<GroupDeletePreview | null>;
  permanentlyDelete: (groupId: string) => Promise<{ success: boolean; message: string }>;
}

// 葴葴預購（product_groups）跟繪師預購（artist_product_groups）共用同一個 UI，
// 只是傳入的 server action 不同（見 archived-products/page.tsx）。
export function ArchivedGroupRow({ group, actions }: { group: ArchivedGroupRowData; actions: ArchivedGroupActions }) {
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<GroupDeletePreview | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleRestore() {
    startTransition(async () => {
      const result = await actions.restore(group.id);
      setMessage(result.message);
    });
  }

  function handleCheckDelete() {
    startTransition(async () => {
      const result = await actions.getDeletePreview(group.id);
      setPreview(result);
      if (!result) setMessage("無法取得刪除影響評估");
    });
  }

  function handleConfirmDelete() {
    if (!window.confirm(`確定要永久刪除「${group.name}」嗎？此動作無法復原。`)) return;
    startTransition(async () => {
      const result = await actions.permanentlyDelete(group.id);
      setMessage(result.message);
      if (result.success) setPreview(null);
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {group.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={group.imageUrl} alt={group.name} className="h-12 w-12 rounded-xl object-cover opacity-60" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100 text-xl">🦝</div>
          )}
          <div>
            <p className="text-xs text-zinc-400">
              {group.teacherName}（{group.teacherCode}）
            </p>
            <p className="font-semibold text-zinc-600">{group.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRestore}
            disabled={isPending}
            className="rounded-full bg-purple-500 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            恢復
          </button>
          <button
            onClick={handleCheckDelete}
            disabled={isPending}
            className="rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            查看永久刪除影響
          </button>
        </div>
      </div>

      {preview && (
        <div className="rounded-xl bg-zinc-50 p-3 text-xs">
          {!preview.canDelete ? (
            <p className="text-red-500">{preview.blockReason}</p>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-zinc-500">
                永久刪除後將從 Storage 移除 {preview.imageUrlsToDelete.length} 張圖片
                {preview.imageUrlsKeptShared.length > 0 &&
                  `（另外 ${preview.imageUrlsKeptShared.length} 張圖片仍被其他品項引用，會保留）`}
                。訂單歷史紀錄不受影響。
              </p>
              {preview.imageUrlsToDelete.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {preview.imageUrlsToDelete.map((url) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={url} src={url} alt="" className="h-10 w-10 rounded object-cover" />
                  ))}
                </div>
              )}
              <button
                onClick={handleConfirmDelete}
                disabled={isPending}
                className="w-fit rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                確認永久刪除
              </button>
            </div>
          )}
        </div>
      )}

      {message && <p className="text-xs text-red-500">{message}</p>}
    </div>
  );
}
