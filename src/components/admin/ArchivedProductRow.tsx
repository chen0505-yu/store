"use client";

import { useState, useTransition } from "react";
import type { AdminProduct } from "@/lib/data/admin-products";
import { permanentlyDeleteProduct, restoreProduct } from "@/lib/actions/products";

export function ArchivedProductRow({ product }: { product: AdminProduct }) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!window.confirm("確定要永久刪除此商品嗎？此動作無法復原。")) return;
    startTransition(async () => {
      const result = await permanentlyDeleteProduct(product.id, product.type);
      setMessage(result.message);
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
            alt={product.name}
            className="h-12 w-12 rounded-xl object-cover opacity-60"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100 text-xl">
            🦝
          </div>
        )}
        <div>
          <p className="text-xs text-zinc-400">
            {product.teacherName}（{product.teacherCode}） · {product.type === "preorder" ? "預購" : "現貨"}
          </p>
          <p className="font-semibold text-zinc-600">{product.name}</p>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-2">
          <button
            onClick={() => startTransition(async () => { await restoreProduct(product.id, product.type); })}
            disabled={isPending}
            className="rounded-full bg-purple-500 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            恢復
          </button>
          <button
            onClick={handleDelete}
            disabled={isPending}
            className="rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            永久刪除
          </button>
        </div>
        {message && <p className="text-xs text-red-500">{message}</p>}
      </div>
    </div>
  );
}
