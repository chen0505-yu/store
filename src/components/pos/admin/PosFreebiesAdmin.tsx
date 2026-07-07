"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PosArtistWithEventName } from "@/lib/data/pos-artists";
import type { PosProductGroupWithArtistName } from "@/lib/data/pos-products";
import type { PosFreebieRuleWithArtistName } from "@/lib/data/pos-freebies";
import {
  createFreebieRule,
  updateFreebieRule,
  deleteFreebieRule,
  type PosFreebieOptionInput,
  type PosFreebieRuleInput,
} from "@/lib/actions/pos-freebies";
import type { PosFreebieRuleType } from "@/lib/pos-types";
import { GlassCard } from "@/components/pos/GlassCard";
import { GlowButton } from "@/components/pos/GlowButton";

interface FormState {
  artistId: string;
  name: string;
  ruleType: PosFreebieRuleType;
  thresholdAmount: string;
  triggerGroupId: string;
  isStackable: boolean;
  isActive: boolean;
  options: PosFreebieOptionInput[];
}

function emptyForm(defaultArtistId: string): FormState {
  return {
    artistId: defaultArtistId,
    name: "",
    ruleType: "spend_threshold",
    thresholdAmount: "",
    triggerGroupId: "",
    isStackable: false,
    isActive: true,
    options: [{ name: "", stockQuantity: 0 }],
  };
}

function describeRule(rule: PosFreebieRuleWithArtistName, groups: PosProductGroupWithArtistName[]): string {
  if (rule.ruleType === "spend_threshold") return `消耗額度 NT$${rule.thresholdAmount ?? 0}`;
  const group = groups.find((g) => g.id === rule.triggerGroupId);
  return `購買「${group?.name ?? "已刪除的商品"}」送贈品`;
}

export function PosFreebiesAdmin({
  rules,
  artists,
  groups,
  canDelete,
  selectedArtistId,
}: {
  rules: PosFreebieRuleWithArtistName[];
  artists: PosArtistWithEventName[];
  groups: PosProductGroupWithArtistName[];
  canDelete: boolean;
  selectedArtistId: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(emptyForm(selectedArtistId || artists[0]?.id || ""));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const visibleRules = selectedArtistId ? rules.filter((r) => r.artistId === selectedArtistId) : rules;
  const artistGroups = groups.filter((g) => g.artistId === form.artistId);

  const [prevSelectedArtistId, setPrevSelectedArtistId] = useState(selectedArtistId);
  if (selectedArtistId !== prevSelectedArtistId) {
    setPrevSelectedArtistId(selectedArtistId);
    if (!editingId) setForm(emptyForm(selectedArtistId || artists[0]?.id || ""));
  }

  function handleArtistFilterChange(value: string) {
    router.push(value ? `/pos/admin/freebies?artistId=${value}` : "/pos/admin/freebies");
  }

  function resetForm() {
    setForm(emptyForm(selectedArtistId || artists[0]?.id || ""));
    setEditingId(null);
  }

  function startEdit(rule: PosFreebieRuleWithArtistName) {
    setEditingId(rule.id);
    setForm({
      artistId: rule.artistId,
      name: rule.name,
      ruleType: rule.ruleType,
      thresholdAmount: rule.thresholdAmount !== null ? String(rule.thresholdAmount) : "",
      triggerGroupId: rule.triggerGroupId ?? "",
      isStackable: rule.isStackable,
      isActive: rule.isActive,
      options: rule.options.map((o) => ({ name: o.name, stockQuantity: o.stockQuantity })),
    });
  }

  function addOptionRow() {
    setForm((f) => ({ ...f, options: [...f.options, { name: "", stockQuantity: 0 }] }));
  }

  function updateOptionRow(index: number, patch: Partial<PosFreebieOptionInput>) {
    setForm((f) => ({ ...f, options: f.options.map((o, i) => (i === index ? { ...o, ...patch } : o)) }));
  }

  function removeOptionRow(index: number) {
    setForm((f) => ({ ...f, options: f.options.filter((_, i) => i !== index) }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const input: PosFreebieRuleInput = {
      artistId: form.artistId,
      name: form.name,
      ruleType: form.ruleType,
      thresholdAmount: form.thresholdAmount ? Number(form.thresholdAmount) : null,
      triggerGroupId: form.triggerGroupId || null,
      isStackable: form.isStackable,
      isActive: form.isActive,
      options: form.options,
    };
    startTransition(async () => {
      const result = editingId ? await updateFreebieRule(editingId, input) : await createFreebieRule(input);
      setMessage(result.message);
      if (result.success) {
        resetForm();
        router.refresh();
      }
    });
  }

  function remove(id: string) {
    if (!confirm("確定要刪除這條贈品規則嗎？")) return;
    startTransition(async () => {
      const result = await deleteFreebieRule(id);
      setMessage(result.message);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--pos-gold)" }}>
          滿額贈品
        </h1>
        <p className="text-sm text-[var(--pos-text-muted)]">
          購物車小計就是可用額度，每款滿額贈品都有自己的消耗額度，小幫手結帳時可以自由組合，
          只要花費總和不超過小計即可，也可以選擇不拿。
        </p>
      </div>

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
          <p className="text-sm text-[var(--pos-text-muted)]">請先到「繪師管理」建立繪師，才能新增贈品規則。</p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-wrap items-start gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[var(--pos-text-muted)]">所屬繪師</label>
                <select
                  className="pos-input px-3 py-2 text-sm"
                  value={form.artistId}
                  onChange={(e) => setForm((f) => ({ ...f, artistId: e.target.value, triggerGroupId: "" }))}
                >
                  {artists.map((artist) => (
                    <option key={artist.id} value={artist.id} className="bg-[#1a1140]">
                      {artist.eventName}／{artist.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[var(--pos-text-muted)]">規則名稱</label>
                <input
                  className="pos-input px-3 py-2 text-sm"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="例如 滿500贈品"
                  required
                />
              </div>
              {form.ruleType === "buy_product" && (
                <label className="flex items-center gap-2 self-end pb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.isStackable}
                    onChange={(e) => setForm((f) => ({ ...f, isStackable: e.target.checked }))}
                  />
                  可累贈（買 N 件賺 N 次）
                </label>
              )}
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                />
                啟用中
              </label>
            </div>

            <div className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[var(--pos-text-muted)]">類型</label>
                <select
                  className="pos-input px-3 py-2 text-sm"
                  value={form.ruleType}
                  onChange={(e) => setForm((f) => ({ ...f, ruleType: e.target.value as PosFreebieRuleType }))}
                >
                  <option value="spend_threshold" className="bg-[#1a1140]">
                    滿額贈品（額度池）
                  </option>
                  <option value="buy_product" className="bg-[#1a1140]">
                    購買指定商品送贈品
                  </option>
                </select>
              </div>
              {form.ruleType === "spend_threshold" ? (
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-[var(--pos-text-muted)]">消耗額度</label>
                  <input
                    type="number"
                    min={1}
                    className="pos-input w-28 px-3 py-2 text-sm"
                    value={form.thresholdAmount}
                    onChange={(e) => setForm((f) => ({ ...f, thresholdAmount: e.target.value }))}
                  />
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-[var(--pos-text-muted)]">指定商品</label>
                  <select
                    className="pos-input px-3 py-2 text-sm"
                    value={form.triggerGroupId}
                    onChange={(e) => setForm((f) => ({ ...f, triggerGroupId: e.target.value }))}
                  >
                    <option value="" className="bg-[#1a1140]">
                      請選擇
                    </option>
                    {artistGroups.map((group) => (
                      <option key={group.id} value={group.id} className="bg-[#1a1140]">
                        {group.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="pos-input flex flex-col gap-2 p-3">
              <p className="text-xs text-[var(--pos-text-muted)]">候選贈品（多選一，小幫手結帳時挑一款）</p>
              {form.options.map((option, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    className="pos-input flex-1 px-3 py-2 text-sm"
                    placeholder="贈品名稱"
                    value={option.name}
                    onChange={(e) => updateOptionRow(index, { name: e.target.value })}
                  />
                  <input
                    type="number"
                    min={0}
                    className="pos-input w-24 px-3 py-2 text-sm"
                    placeholder="庫存"
                    value={option.stockQuantity}
                    onChange={(e) => updateOptionRow(index, { stockQuantity: Number(e.target.value) })}
                  />
                  <button type="button" onClick={() => removeOptionRow(index)} className="text-xs text-red-400">
                    移除
                  </button>
                </div>
              ))}
              <button type="button" onClick={addOptionRow} className="pos-input self-start px-3 py-1.5 text-xs">
                ＋ 新增候選贈品
              </button>
            </div>

            <div className="flex items-center gap-2">
              <GlowButton type="submit" disabled={isPending}>
                {editingId ? "儲存規則" : "新增規則"}
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

      <div className="flex flex-col gap-2">
        {visibleRules.map((rule) => (
          <GlassCard key={rule.id} className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <p className="font-semibold">
                {rule.name} <span className="text-xs text-[var(--pos-text-muted)]">（{rule.artistName}）</span>
              </p>
              <p className="text-sm" style={{ color: "var(--pos-gold)" }}>
                {describeRule(rule, groups)}
                {rule.ruleType === "buy_product" && (rule.isStackable ? "｜可累贈" : "｜不可累贈")}
              </p>
              <p className="text-xs text-[var(--pos-text-muted)]">
                候選贈品：{rule.options.map((o) => `${o.name}(${o.stockQuantity})`).join("／")}
              </p>
              <p className="text-xs">
                {rule.isActive ? (
                  <span style={{ color: "var(--pos-gold)" }}>啟用中</span>
                ) : (
                  <span className="text-[var(--pos-text-muted)]">已停用</span>
                )}
              </p>
              <div className="mt-2 flex gap-2 text-xs">
                <button onClick={() => startEdit(rule)} className="pos-input px-2 py-1">
                  編輯
                </button>
                {canDelete && (
                  <button onClick={() => remove(rule.id)} className="text-red-400 hover:text-red-300">
                    刪除
                  </button>
                )}
              </div>
            </div>
          </GlassCard>
        ))}
        {visibleRules.length === 0 && (
          <p className="text-sm text-[var(--pos-text-muted)]">
            {selectedArtistId ? "這位繪師尚未建立任何贈品規則" : "尚未建立任何贈品規則"}
          </p>
        )}
      </div>
    </div>
  );
}
