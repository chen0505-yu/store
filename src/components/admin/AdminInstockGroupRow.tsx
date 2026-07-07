"use client";

import { useState, useTransition } from "react";
import type { AdminInstockGroup, AdminInstockVariant } from "@/lib/data/admin-instock-shops";
import type { Tag } from "@/lib/data/tags";
import {
  addInstockVariant,
  archiveInstockGroup,
  renameInstockVariant,
  setInstockBlindDrawConfig,
  toggleInstockGroupCpSpoiler,
  toggleInstockVariantActive,
  toggleInstockVariantBonusOption,
  updateInstockGroup,
  updateInstockVariantStock,
} from "@/lib/actions/instock-shop";
import { MultiImageUploader } from "./MultiImageUploader";
import { TagPicker } from "./TagPicker";

function VariantRow({ variant }: { variant: AdminInstockVariant }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(variant.name);
  const [stock, setStock] = useState(String(variant.stockQuantity));
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      await renameInstockVariant(variant.id, name);
      setEditing(false);
    });
  }

  function handleUpdateStock() {
    startTransition(async () => {
      await updateInstockVariantStock(variant.id, Number(stock) || 0);
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-1.5 text-sm">
      {editing ? (
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 rounded border border-pink-200 px-2 py-1 text-sm"
        />
      ) : (
        <span className={variant.isActive ? "text-zinc-700" : "text-zinc-400 line-through"}>{variant.name}</span>
      )}
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={0}
          value={stock}
          onChange={(e) => setStock(e.target.value)}
          className="w-16 rounded-lg border border-pink-200 px-2 py-1 text-center text-xs"
        />
        <button onClick={handleUpdateStock} disabled={isPending} className="text-xs text-pink-500 underline">
          更新庫存
        </button>
        {variant.isSoldOut && <span className="text-xs text-zinc-400">已售完</span>}
        {editing ? (
          <button onClick={handleSave} disabled={isPending} className="text-xs text-purple-600 underline">
            儲存
          </button>
        ) : (
          <button onClick={() => setEditing(true)} className="text-xs text-purple-500 underline">
            編輯
          </button>
        )}
        <button
          onClick={() =>
            startTransition(async () => {
              await toggleInstockVariantActive(variant.id, !variant.isActive);
            })
          }
          disabled={isPending}
          className="text-xs text-zinc-400 underline"
        >
          {variant.isActive ? "下架" : "上架"}
        </button>
        <button
          onClick={() =>
            startTransition(async () => {
              await toggleInstockVariantBonusOption(variant.id, !variant.isBonusOption);
            })
          }
          disabled={isPending}
          className={`rounded-full px-2 py-0.5 text-xs ${
            variant.isBonusOption ? "bg-pink-100 text-pink-600" : "bg-zinc-100 text-zinc-400"
          }`}
        >
          {variant.isBonusOption ? "可選保底 ✓" : "可選保底"}
        </button>
      </div>
    </div>
  );
}

export function AdminInstockGroupRow({ group, allTags }: { group: AdminInstockGroup; allTags: Tag[] }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const [price, setPrice] = useState(String(group.price));
  const [imageUrls, setImageUrls] = useState<string[]>(group.images);
  const [tags, setTags] = useState<string[]>(group.tags);
  const [newVariantName, setNewVariantName] = useState("");
  const [newVariantStock, setNewVariantStock] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [isBlindDraw, setIsBlindDraw] = useState(group.isBlindDraw);
  const [thresholdQty, setThresholdQty] = useState(String(group.blindDrawThresholdQty ?? ""));
  const [pickQty, setPickQty] = useState(String(group.blindDrawPickQty ?? ""));
  const [blindDrawMessage, setBlindDrawMessage] = useState<string | null>(null);

  function handleSaveEdit() {
    startTransition(async () => {
      const result = await updateInstockGroup(group.id, {
        name,
        price: Number(price) || 0,
        imageUrls,
        tags,
      });
      setMessage(result.message);
      if (result.success) setEditing(false);
    });
  }

  function handleSaveBlindDraw() {
    startTransition(async () => {
      const result = await setInstockBlindDrawConfig(group.id, {
        isBlindDraw,
        thresholdQty: Number(thresholdQty) || null,
        pickQty: Number(pickQty) || null,
      });
      setBlindDrawMessage(result.message);
    });
  }

  function handleAddVariant() {
    if (!newVariantName.trim()) return;
    startTransition(async () => {
      const result = await addInstockVariant(group.id, newVariantName, Number(newVariantStock) || 0);
      if (result.success) {
        setNewVariantName("");
        setNewVariantStock("");
      }
      setMessage(result.message);
    });
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-500">品項名稱</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-lg border border-pink-200 px-3 py-2"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-500">價格</label>
            <input
              type="number"
              min={0}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="rounded-lg border border-pink-200 px-3 py-2"
            />
          </div>
          <div className="sm:col-span-2">
            <MultiImageUploader value={imageUrls} onChange={setImageUrls} folder="products" />
          </div>
          <div className="flex flex-col gap-1 sm:col-span-2">
            <label className="text-xs text-zinc-500">Tags</label>
            <TagPicker allTags={allTags} selected={tags} onChange={setTags} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSaveEdit}
            disabled={isPending}
            className="rounded-full bg-pink-500 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            儲存
          </button>
          <button onClick={() => setEditing(false)} className="rounded-full bg-zinc-100 px-4 py-2 text-xs text-zinc-500">
            取消
          </button>
        </div>
        {message && <p className="text-xs text-pink-600">{message}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          {group.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={group.imageUrl} alt={group.name} className="h-12 w-12 rounded-xl object-cover" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-pink-50 text-xl">🦝</div>
          )}
          <div>
            <p className="font-semibold text-zinc-800">{group.name}</p>
            <p className="text-sm text-pink-600">NT$ {group.price}</p>
            {group.tags.length > 0 && (
              <p className="text-xs text-zinc-400">{group.tags.map((t) => `#${t}`).join(" ")}</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setEditing(true)} className="rounded-full bg-pink-50 px-3 py-1 text-xs text-pink-600">
            編輯
          </button>
          <button
            onClick={() =>
              startTransition(async () => {
                await toggleInstockGroupCpSpoiler(group.id, !group.isCpSpoiler);
              })
            }
            disabled={isPending}
            className={`rounded-full px-3 py-1 text-xs ${
              group.isCpSpoiler ? "bg-zinc-800 text-white" : "bg-zinc-100 text-zinc-400"
            }`}
          >
            {group.isCpSpoiler ? "CP 防雷 ✓" : "CP 防雷"}
          </button>
          <button
            onClick={() => {
              if (!window.confirm("確定要封存此品項嗎？")) return;
              startTransition(async () => {
                await archiveInstockGroup(group.id);
              });
            }}
            disabled={isPending}
            className="rounded-full bg-red-50 px-3 py-1 text-xs text-red-500"
          >
            封存
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-xl bg-pink-50/60 p-3">
        <label className="flex items-center gap-2 text-xs font-semibold text-pink-700">
          <input
            type="checkbox"
            checked={isBlindDraw}
            onChange={(e) => setIsBlindDraw(e.target.checked)}
          />
          盲抽/滿抽選品（買滿幾件可選幾個保底細項）
        </label>
        {isBlindDraw && (
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-zinc-500">每買幾件</label>
              <input
                type="number"
                min={1}
                value={thresholdQty}
                onChange={(e) => setThresholdQty(e.target.value)}
                placeholder="例如 5"
                className="rounded-lg border border-pink-200 px-2 py-1 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-zinc-500">可選幾個保底</label>
              <input
                type="number"
                min={1}
                value={pickQty}
                onChange={(e) => setPickQty(e.target.value)}
                placeholder="例如 1"
                className="rounded-lg border border-pink-200 px-2 py-1 text-sm"
              />
            </div>
          </div>
        )}
        <button
          onClick={handleSaveBlindDraw}
          disabled={isPending}
          className="w-fit rounded-full bg-pink-500 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {isPending ? "儲存中..." : "儲存盲抽設定"}
        </button>
        {blindDrawMessage && <p className="text-xs text-pink-600">{blindDrawMessage}</p>}
      </div>

      <div className="flex flex-col gap-1 rounded-xl bg-zinc-50 p-3">
        <p className="text-xs font-semibold text-zinc-500">
          細項（盲抽開啟時，可以在每個細項上標記「可選保底」）
        </p>
        <div className="flex flex-col gap-1">
          {group.variants.map((variant) => (
            <VariantRow key={variant.id} variant={variant} />
          ))}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <input
            value={newVariantName}
            onChange={(e) => setNewVariantName(e.target.value)}
            placeholder="新增細項名稱"
            className="flex-1 rounded-lg border border-pink-200 px-2 py-1 text-sm"
          />
          <input
            type="number"
            min={0}
            value={newVariantStock}
            onChange={(e) => setNewVariantStock(e.target.value)}
            placeholder="庫存"
            className="w-20 rounded-lg border border-pink-200 px-2 py-1 text-sm"
          />
          <button
            onClick={handleAddVariant}
            disabled={isPending || !newVariantName.trim()}
            className="rounded-full bg-pink-500 px-3 py-1 text-xs text-white disabled:opacity-50"
          >
            新增
          </button>
        </div>
      </div>
      {message && <p className="text-xs text-pink-600">{message}</p>}
    </div>
  );
}
