"use client";

import { useState, useTransition } from "react";
import type { Tag } from "@/lib/data/tags";
import { createArtistProductGroup } from "@/lib/actions/artist-shop";
import { MultiImageUploader } from "./MultiImageUploader";
import { TagPicker } from "./TagPicker";

export function ArtistProductGroupCreateForm({ teacherId, allTags }: { teacherId: string; allTags: Tag[] }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [variantNamesText, setVariantNamesText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    const variantNames = variantNamesText
      .split(/[\n,、]/)
      .map((v) => v.trim())
      .filter(Boolean);
    startTransition(async () => {
      const result = await createArtistProductGroup({
        teacherId,
        name,
        price: Number(price) || 0,
        imageUrls,
        tags,
        variantNames,
      });
      setMessage(result.message);
      if (result.success) {
        setName("");
        setPrice("");
        setImageUrls([]);
        setTags([]);
        setVariantNamesText("");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
      <p className="font-semibold text-purple-700">新增品項</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-500">品項名稱</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：小卡"
            className="rounded-lg border border-purple-200 px-3 py-2"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-500">價格</label>
          <input
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="rounded-lg border border-purple-200 px-3 py-2"
          />
        </div>
        <div className="sm:col-span-2">
          <MultiImageUploader value={imageUrls} onChange={setImageUrls} folder="artist-products" />
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label className="text-xs text-zinc-500">Tags</label>
          <TagPicker allTags={allTags} selected={tags} onChange={setTags} />
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label className="text-xs text-zinc-500">細項（用逗號或換行分隔，例如：白厄、昔漣、萬敵）</label>
          <textarea
            value={variantNamesText}
            onChange={(e) => setVariantNamesText(e.target.value)}
            rows={2}
            className="rounded-lg border border-purple-200 px-3 py-2"
          />
        </div>
      </div>
      <button
        onClick={handleSubmit}
        disabled={isPending || !name.trim() || !variantNamesText.trim()}
        className="w-fit rounded-full bg-purple-500 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
      >
        {isPending ? "建立中..." : "建立品項"}
      </button>
      {message && <p className="text-xs text-purple-600">{message}</p>}
    </div>
  );
}
