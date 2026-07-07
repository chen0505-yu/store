"use client";

import { useState, useTransition } from "react";
import type { Tag } from "@/lib/data/tags";
import { createTeacherShopBatch } from "@/lib/actions/teacher-shop";
import { fromLocalInputValue } from "@/lib/datetime";
import { ImageUploader } from "./ImageUploader";
import { MultiImageUploader } from "./MultiImageUploader";
import { TagPicker } from "./TagPicker";

interface VariantRowState {
  key: string;
  name: string;
}

interface GroupRowState {
  key: string;
  name: string;
  price: string;
  imageUrls: string[];
  tags: string[];
  variants: VariantRowState[];
}

let keyCounter = 0;
function nextKey(prefix: string) {
  keyCounter += 1;
  return `${prefix}-${keyCounter}`;
}

function emptyVariant(): VariantRowState {
  return { key: nextKey("variant"), name: "" };
}

function emptyGroup(): GroupRowState {
  return {
    key: nextKey("group"),
    name: "",
    price: "",
    imageUrls: [],
    tags: [],
    variants: [emptyVariant()],
  };
}

// 老師賣場批量上架：一次填老師名稱＋整間賣場共用的預購時間，
// 再新增多個品項（例如小卡/印刷品/吊飾），每個品項底下再新增多個細項（白厄/昔漣/萬敵），
// 送出後一次建立「老師 → 品項 → 細項」整個結構。
export function TeacherShopBatchForm({ allTags }: { allTags: Tag[] }) {
  const [teacherName, setTeacherName] = useState("");
  const [teacherImageUrls, setTeacherImageUrls] = useState<string[]>([]);
  const [preorderStartsAt, setPreorderStartsAt] = useState("");
  const [preorderEndsAt, setPreorderEndsAt] = useState("");
  const [groups, setGroups] = useState<GroupRowState[]>([emptyGroup()]);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateGroup(key: string, patch: Partial<GroupRowState>) {
    setGroups((prev) => prev.map((g) => (g.key === key ? { ...g, ...patch } : g)));
  }

  function addGroup() {
    setGroups((prev) => [...prev, emptyGroup()]);
  }

  function removeGroup(key: string) {
    setGroups((prev) => (prev.length <= 1 ? prev : prev.filter((g) => g.key !== key)));
  }

  function addVariant(groupKey: string) {
    setGroups((prev) =>
      prev.map((g) => (g.key === groupKey ? { ...g, variants: [...g.variants, emptyVariant()] } : g))
    );
  }

  function removeVariant(groupKey: string, variantKey: string) {
    setGroups((prev) =>
      prev.map((g) =>
        g.key === groupKey
          ? {
              ...g,
              variants: g.variants.length <= 1 ? g.variants : g.variants.filter((v) => v.key !== variantKey),
            }
          : g
      )
    );
  }

  function updateVariantName(groupKey: string, variantKey: string, name: string) {
    setGroups((prev) =>
      prev.map((g) =>
        g.key === groupKey
          ? { ...g, variants: g.variants.map((v) => (v.key === variantKey ? { ...v, name } : v)) }
          : g
      )
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const payload = groups
        .filter((g) => g.name.trim())
        .map((g) => ({
          name: g.name,
          price: Number(g.price) || 0,
          imageUrls: g.imageUrls,
          tags: g.tags,
          variantNames: g.variants.map((v) => v.name),
        }));

      const result = await createTeacherShopBatch(
        teacherName,
        fromLocalInputValue(preorderStartsAt),
        fromLocalInputValue(preorderEndsAt),
        payload,
        teacherImageUrls
      );
      setMessage(result.message);
      if (result.success) {
        setGroups([emptyGroup()]);
        setTeacherImageUrls([]);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-3xl bg-white p-5 shadow-sm">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1 sm:col-span-1">
          <label className="text-xs text-zinc-500">老師名稱 *（不存在會自動建立，已存在會自動歸到底下）</label>
          <input
            value={teacherName}
            onChange={(e) => setTeacherName(e.target.value)}
            placeholder="例如：越南Hitsuzi"
            required
            className="rounded-lg border border-purple-200 px-3 py-2"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-500">預購開始時間（留空 = 即日起）</label>
          <input
            type="datetime-local"
            value={preorderStartsAt}
            onChange={(e) => setPreorderStartsAt(e.target.value)}
            className="rounded-lg border border-purple-200 px-3 py-2"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-500">預購截止時間（留空 = 不限制）</label>
          <input
            type="datetime-local"
            value={preorderEndsAt}
            onChange={(e) => setPreorderEndsAt(e.target.value)}
            className="rounded-lg border border-purple-200 px-3 py-2"
          />
        </div>
      </div>
      <p className="text-xs text-zinc-400">整間賣場共用同一組預購時間，不用每個品項各自設定。</p>

      <div className="flex flex-col gap-1">
        <p className="text-xs text-zinc-500">
          老師賣場封面圖（只在新建立老師時套用；既有老師請到下方賣場列表編輯）
        </p>
        <MultiImageUploader value={teacherImageUrls} onChange={setTeacherImageUrls} folder="teachers" />
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold text-purple-600">品項（例如小卡、印刷品、吊飾）</p>
        {groups.map((group, groupIndex) => (
          <div key={group.key} className="flex flex-col gap-3 rounded-2xl border border-purple-100 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-500">品項 {groupIndex + 1}</span>
              <button
                type="button"
                onClick={() => removeGroup(group.key)}
                disabled={groups.length <= 1}
                className="text-xs text-red-500 underline disabled:opacity-30"
              >
                刪除此品項
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-500">品項名稱 *（例如：小卡）</label>
                <input
                  value={group.name}
                  onChange={(e) => updateGroup(group.key, { name: e.target.value })}
                  className="rounded-lg border border-purple-200 px-3 py-2"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-500">價格 *（細項共用同一個價格）</label>
                <input
                  type="number"
                  min={0}
                  value={group.price}
                  onChange={(e) => updateGroup(group.key, { price: e.target.value })}
                  className="rounded-lg border border-purple-200 px-3 py-2"
                />
              </div>

              <div className="sm:col-span-2">
                <ImageUploader
                  value={group.imageUrls[0] ?? ""}
                  onChange={(url) => updateGroup(group.key, { imageUrls: url ? [url] : [] })}
                  folder="products"
                  label="品項圖片"
                />
              </div>

              <div className="flex flex-col gap-1 sm:col-span-2">
                <label className="text-xs text-zinc-500">Tags</label>
                <TagPicker allTags={allTags} selected={group.tags} onChange={(tags) => updateGroup(group.key, { tags })} />
              </div>
            </div>

            <div className="flex flex-col gap-2 rounded-xl bg-purple-50/60 p-3">
              <p className="text-xs font-semibold text-purple-600">細項（例如：白厄、昔漣、萬敵）</p>
              {group.variants.map((variant, variantIndex) => (
                <div key={variant.key} className="flex items-center gap-2">
                  <input
                    value={variant.name}
                    onChange={(e) => updateVariantName(group.key, variant.key, e.target.value)}
                    placeholder={`細項 ${variantIndex + 1}`}
                    className="flex-1 rounded-lg border border-purple-200 px-3 py-1.5 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => removeVariant(group.key, variant.key)}
                    disabled={group.variants.length <= 1}
                    className="text-xs text-red-500 underline disabled:opacity-30"
                  >
                    刪除
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => addVariant(group.key)}
                className="w-fit rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-600"
              >
                + 新增細項
              </button>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={addGroup}
          className="w-fit rounded-full bg-purple-50 px-4 py-2 text-xs font-semibold text-purple-600"
        >
          + 新增一個品項
        </button>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-fit rounded-full bg-gradient-to-r from-pink-400 to-purple-400 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {isPending ? "建立中..." : "一次建立整個老師賣場"}
      </button>
      {message && <p className="text-xs text-purple-600">{message}</p>}
    </form>
  );
}
