"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PosArtistWithEventName } from "@/lib/data/pos-artists";
import type { PosProductGroupWithArtistName } from "@/lib/data/pos-products";
import {
  createPosProductGroup,
  updatePosProductGroup,
  deletePosProductGroup,
  updatePosProductStock,
  reorderPosProductGroups,
  type PosProductVariantInput,
} from "@/lib/actions/pos-products";
import { hasVariants as groupHasVariants } from "@/lib/pos-product-stock";
import { GlassCard } from "@/components/pos/GlassCard";
import { GlowButton } from "@/components/pos/GlowButton";
import { PosImageUploader } from "@/components/pos/PosImageUploader";

interface FormState {
  artistId: string;
  name: string;
  imageUrl: string;
  price: string;
  note: string;
  stockQuantity: string;
  isActive: boolean;
  useVariants: boolean;
  variants: PosProductVariantInput[];
}

function emptyForm(defaultArtistId: string): FormState {
  return {
    artistId: defaultArtistId,
    name: "",
    imageUrl: "",
    price: "0",
    note: "",
    stockQuantity: "0",
    isActive: true,
    useVariants: false,
    variants: [],
  };
}

export function PosProductsAdmin({
  groups,
  artists,
  canDelete,
  selectedArtistId,
}: {
  groups: PosProductGroupWithArtistName[];
  artists: PosArtistWithEventName[];
  canDelete: boolean;
  selectedArtistId: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(emptyForm(selectedArtistId || artists[0]?.id || ""));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const visibleGroups = selectedArtistId ? groups.filter((g) => g.artistId === selectedArtistId) : groups;
  const visibleGroupIds = visibleGroups.map((g) => g.id).join(",");

  // 篩選 Artist 改變時，「新增商品」表單要跟著帶入該 Artist（正在編輯中就不打斷）。
  // 用「渲染時比對上一次的值，不同就直接呼叫 setState」取代 useEffect，避免多一次渲染
  // （React 官方推薦的「依 prop 重置 state」寫法，見 react-hooks/set-state-in-effect）。
  const [prevSelectedArtistId, setPrevSelectedArtistId] = useState(selectedArtistId);
  if (selectedArtistId !== prevSelectedArtistId) {
    setPrevSelectedArtistId(selectedArtistId);
    if (!editingId) setForm(emptyForm(selectedArtistId || artists[0]?.id || ""));
  }

  // 拖曳排序只在選定單一 Artist 時開放（POS 收銀畫面一次只看一位繪師的商品，排序才有意義）。
  // orderedGroups 是本地暫存的顯示順序，拖曳當下先立即反應，背景再送出排序更新。
  const [orderedGroups, setOrderedGroups] = useState(visibleGroups);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [prevVisibleGroupIds, setPrevVisibleGroupIds] = useState(visibleGroupIds);
  if (visibleGroupIds !== prevVisibleGroupIds) {
    setPrevVisibleGroupIds(visibleGroupIds);
    setOrderedGroups(visibleGroups);
  }

  function commitReorder(next: PosProductGroupWithArtistName[]) {
    setOrderedGroups(next);
    startTransition(async () => {
      await reorderPosProductGroups(selectedArtistId, next.map((g) => g.id));
      router.refresh();
    });
  }

  function handleDrop(dropIndex: number) {
    if (dragIndex === null || dragIndex === dropIndex) {
      setDragIndex(null);
      return;
    }
    const next = [...orderedGroups];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(dropIndex, 0, moved);
    setDragIndex(null);
    commitReorder(next);
  }

  // 拖曳在平板不好操作時的備用方案：直接交換相鄰兩筆的位置。
  function moveGroup(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= orderedGroups.length) return;
    const next = [...orderedGroups];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    commitReorder(next);
  }

  function handleStockSave(groupId: string, stockQuantity: number) {
    startTransition(async () => {
      const result = await updatePosProductStock(groupId, stockQuantity);
      setMessage(result.message);
      router.refresh();
    });
  }

  function handleArtistFilterChange(value: string) {
    router.push(value ? `/pos/admin/products?artistId=${value}` : "/pos/admin/products");
  }

  function resetForm() {
    setForm(emptyForm(selectedArtistId || artists[0]?.id || ""));
    setEditingId(null);
  }

  function startEdit(group: PosProductGroupWithArtistName) {
    setEditingId(group.id);
    setForm({
      artistId: group.artistId,
      name: group.name,
      imageUrl: group.imageUrl ?? "",
      price: String(group.price),
      note: group.note ?? "",
      stockQuantity: String(group.stockQuantity),
      isActive: group.isActive,
      useVariants: groupHasVariants(group),
      variants: group.variants.map((v) => ({ name: v.name, stockQuantity: v.stockQuantity })),
    });
  }

  function addVariantRow() {
    setForm((f) => ({ ...f, variants: [...f.variants, { name: "", stockQuantity: 0 }] }));
  }

  function updateVariantRow(index: number, patch: Partial<PosProductVariantInput>) {
    setForm((f) => ({
      ...f,
      variants: f.variants.map((v, i) => (i === index ? { ...v, ...patch } : v)),
    }));
  }

  function removeVariantRow(index: number) {
    setForm((f) => ({ ...f, variants: f.variants.filter((_, i) => i !== index) }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const input = {
      artistId: form.artistId,
      name: form.name,
      imageUrl: form.imageUrl || null,
      price: Number(form.price),
      note: form.note || null,
      stockQuantity: Number(form.stockQuantity),
      isActive: form.isActive,
      variants: form.useVariants ? form.variants : [],
    };
    startTransition(async () => {
      const result = editingId
        ? await updatePosProductGroup(editingId, input)
        : await createPosProductGroup(input);
      setMessage(result.message);
      if (result.success) {
        resetForm();
        router.refresh();
      }
    });
  }

  function remove(id: string) {
    if (!confirm("確定要刪除這件商品嗎？")) return;
    startTransition(async () => {
      const result = await deletePosProductGroup(id);
      setMessage(result.message);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold" style={{ color: "var(--pos-gold)" }}>
        商品管理
      </h1>

      <div className="flex items-center gap-2">
        <label className="text-xs text-[var(--pos-text-muted)]">Artist</label>
        <select
          className="pos-input px-3 py-2 text-sm"
          value={selectedArtistId}
          onChange={(e) => handleArtistFilterChange(e.target.value)}
        >
          <option value="" className="bg-[#1a1140]">
            全部
          </option>
          {artists.map((artist) => (
            <option key={artist.id} value={artist.id} className="bg-[#1a1140]">
              {artist.name}
            </option>
          ))}
        </select>
      </div>

      <GlassCard>
        {artists.length === 0 ? (
          <p className="text-sm text-[var(--pos-text-muted)]">請先到「繪師管理」建立繪師，才能新增商品。</p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-wrap items-start gap-4">
              <PosImageUploader value={form.imageUrl} onChange={(url) => setForm((f) => ({ ...f, imageUrl: url }))} />
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[var(--pos-text-muted)]">所屬繪師</label>
                <select
                  className="pos-input px-3 py-2 text-sm"
                  value={form.artistId}
                  onChange={(e) => setForm((f) => ({ ...f, artistId: e.target.value }))}
                >
                  {artists.map((artist) => (
                    <option key={artist.id} value={artist.id} className="bg-[#1a1140]">
                      {artist.eventName}／{artist.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[var(--pos-text-muted)]">商品名稱（主項/分類）</label>
                <input
                  className="pos-input px-3 py-2 text-sm"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="例如 小卡"
                  required
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[var(--pos-text-muted)]">單價</label>
                <input
                  type="number"
                  min={0}
                  className="pos-input w-24 px-3 py-2 text-sm"
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[var(--pos-text-muted)]">庫存（POS 實際販售用）</label>
                <input
                  type="number"
                  min={0}
                  className="pos-input w-24 px-3 py-2 text-sm"
                  value={form.stockQuantity}
                  onChange={(e) => setForm((f) => ({ ...f, stockQuantity: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[var(--pos-text-muted)]">備註</label>
                <input
                  className="pos-input px-3 py-2 text-sm"
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder="例如 每人限購2"
                />
              </div>
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                />
                販售中
              </label>
            </div>

            <div className="pos-input flex flex-col gap-2 p-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.useVariants}
                  onChange={(e) => setForm((f) => ({ ...f, useVariants: e.target.checked }))}
                />
                記錄細項（例如小卡底下有哪些角色，各大概幾張）
              </label>
              <p className="text-xs text-[var(--pos-text-muted)]">
                僅供後台自己記錄、活動後盤點用。POS 前台不會顯示、也不會扣細項庫存 ——
                結帳只會扣上面「庫存」那個數字。
              </p>

              {form.useVariants && (
                <div className="flex flex-col gap-2">
                  {form.variants.map((variant, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        className="pos-input flex-1 px-3 py-2 text-sm"
                        placeholder="細項名稱，例如 Sunday"
                        value={variant.name}
                        onChange={(e) => updateVariantRow(index, { name: e.target.value })}
                      />
                      <input
                        type="number"
                        min={0}
                        className="pos-input w-24 px-3 py-2 text-sm"
                        placeholder="數量"
                        value={variant.stockQuantity}
                        onChange={(e) => updateVariantRow(index, { stockQuantity: Number(e.target.value) })}
                      />
                      <button type="button" onClick={() => removeVariantRow(index)} className="text-xs text-red-400">
                        移除
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={addVariantRow} className="pos-input self-start px-3 py-1.5 text-xs">
                    ＋ 新增細項記錄
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <GlowButton type="submit" disabled={isPending}>
                {editingId ? "儲存商品" : "新增商品"}
              </GlowButton>
              {editingId && (
                <button type="button" onClick={resetForm} className="pos-input px-3 py-2 text-sm">
                  取消編輯
                </button>
              )}
            </div>
          </form>
        )}
        {message && <p className="mt-2 text-sm text-[var(--pos-gold)]">{message}</p>}
      </GlassCard>

      {selectedArtistId && orderedGroups.length > 1 && (
        <p className="text-xs text-[var(--pos-text-muted)]">
          拖曳卡片可以調整順序（平板不好拖曳時可改用 ▲▼ 按鈕），POS 收銀畫面會照這個順序顯示商品。
        </p>
      )}

      <div
        className={
          selectedArtistId ? "flex flex-col gap-2" : "grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3"
        }
      >
        {orderedGroups.map((group, index) => (
          <ProductListItem
            key={group.id}
            group={group}
            canDelete={canDelete}
            draggable={Boolean(selectedArtistId)}
            onDragStart={() => setDragIndex(index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(index)}
            onEdit={() => startEdit(group)}
            onDelete={() => remove(group.id)}
            onStockSave={(stock) => handleStockSave(group.id, stock)}
            onMoveUp={selectedArtistId && index > 0 ? () => moveGroup(index, -1) : undefined}
            onMoveDown={
              selectedArtistId && index < orderedGroups.length - 1 ? () => moveGroup(index, 1) : undefined
            }
          />
        ))}
        {orderedGroups.length === 0 && (
          <p className="text-sm text-[var(--pos-text-muted)]">
            {selectedArtistId ? "這位繪師尚未建立任何商品" : "尚未建立任何商品"}
          </p>
        )}
      </div>
    </div>
  );
}

function ProductListItem({
  group,
  canDelete,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
  onEdit,
  onDelete,
  onStockSave,
  onMoveUp,
  onMoveDown,
}: {
  group: PosProductGroupWithArtistName;
  canDelete: boolean;
  draggable: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onStockSave: (stock: number) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const withVariants = groupHasVariants(group);
  const [stockInput, setStockInput] = useState(String(group.stockQuantity));
  const [prevStockQuantity, setPrevStockQuantity] = useState(group.stockQuantity);
  if (group.stockQuantity !== prevStockQuantity) {
    setPrevStockQuantity(group.stockQuantity);
    setStockInput(String(group.stockQuantity));
  }
  const stockDirty = Number(stockInput) !== group.stockQuantity;

  return (
    <GlassCard
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`flex gap-3 ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      {draggable && (
        <div className="flex shrink-0 flex-col items-center gap-1">
          <span className="hidden select-none text-[var(--pos-text-muted)] sm:inline">⋮⋮</span>
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!onMoveUp}
            aria-label="上移"
            className="pos-input h-7 w-7 rounded text-xs disabled:opacity-30"
          >
            ▲
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!onMoveDown}
            aria-label="下移"
            className="pos-input h-7 w-7 rounded text-xs disabled:opacity-30"
          >
            ▼
          </button>
        </div>
      )}
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-black/20">
        {group.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={group.imageUrl} alt={group.name} className="h-full w-full object-cover" />
        )}
      </div>
      <div className="flex-1">
        <p className="font-semibold">{group.name}</p>
        <p className="text-xs text-[var(--pos-text-muted)]">{group.artistName}</p>
        <p className="text-sm" style={{ color: "var(--pos-gold)" }}>
          NT$ {group.price}
        </p>
        <div className="mt-1 flex items-center gap-2 text-xs">
          <span className="text-[var(--pos-text-muted)]">庫存</span>
          <input
            type="number"
            min={0}
            value={stockInput}
            onChange={(e) => setStockInput(e.target.value)}
            className="pos-input w-16 px-2 py-1"
          />
          {stockDirty && (
            <button
              type="button"
              onClick={() => onStockSave(Number(stockInput))}
              className="pos-glow-btn px-2 py-1 text-xs"
            >
              儲存
            </button>
          )}
        </div>
        {withVariants && (
          <p className="mt-1 text-xs text-[var(--pos-text-muted)]">
            細項記錄（僅供參考）：{group.variants.map((v) => `${v.name}(${v.stockQuantity})`).join("／")}
          </p>
        )}
        {group.note && (
          <p className="text-xs" style={{ color: "var(--pos-gold-strong)" }}>
            ⚠ {group.note}
          </p>
        )}
        <p className="text-xs">
          {group.isActive ? (
            <span style={{ color: "var(--pos-gold)" }}>販售中</span>
          ) : (
            <span className="text-[var(--pos-text-muted)]">未販售</span>
          )}
        </p>
        <div className="mt-2 flex gap-2 text-xs">
          <button onClick={onEdit} className="pos-input px-2 py-1">
            編輯
          </button>
          {canDelete && (
            <button onClick={onDelete} className="text-red-400 hover:text-red-300">
              刪除
            </button>
          )}
        </div>
      </div>
    </GlassCard>
  );
}
