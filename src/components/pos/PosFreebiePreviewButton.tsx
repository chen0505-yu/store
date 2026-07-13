"use client";

import { useState } from "react";
import type { PosFreebieRule, PosProductGroup } from "@/lib/pos-types";
import { GlassCard } from "@/components/pos/GlassCard";

// 結帳前預覽用：純唯讀顯示這位繪師目前有哪些啟用中的贈品規則，不能在這裡選贈品、
// 加減數量或改設定 —— 真正選贈品仍然只在 PosCashierView 的結帳流程裡進行。
// 手機（<md）用底部抽屜、平板/桌機（≥md）用置中 Modal，共用同一個 overlay + card，
// 靠 items-end/items-center 與 rounded-t-2xl/rounded-2xl 切換兩種呈現方式。
export function PosFreebiePreviewButton({
  artistName,
  freebieRules,
  groups,
}: {
  artistName: string;
  freebieRules: PosFreebieRule[];
  groups: PosProductGroup[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const groupNameById = new Map(groups.map((g) => [g.id, g.name]));

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="pos-input shrink-0 px-3 py-2 text-sm"
      >
        🎁 查看贈品
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 md:items-center md:p-4"
          onClick={() => setIsOpen(false)}
        >
          <GlassCard
            className="max-h-[85vh] w-full overflow-y-auto rounded-b-none md:max-w-md md:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-lg font-semibold" style={{ color: "var(--pos-gold)" }}>
                🎁 {artistName} 的贈品活動
              </h3>
              <button type="button" onClick={() => setIsOpen(false)} className="pos-input h-8 w-8 rounded-full text-sm">
                ✕
              </button>
            </div>
            <p className="mb-4 text-xs text-[var(--pos-text-muted)]">
              僅供結帳前參考，實際選擇贈品請於結帳流程中進行。
            </p>

            <div className="flex flex-col gap-3">
              {freebieRules.map((rule) => (
                <div key={rule.id} className="pos-input p-3">
                  <p className="mb-1 font-semibold">{rule.name}</p>
                  <p className="mb-2 text-xs text-[var(--pos-text-muted)]">
                    {rule.ruleType === "spend_threshold" ? (
                      <>消耗額度：NT$ {rule.thresholdAmount}</>
                    ) : (
                      <>
                        指定商品：{groupNameById.get(rule.triggerGroupId ?? "") ?? "（商品已下架）"}
                        {rule.isStackable ? "（可累贈）" : ""}
                      </>
                    )}
                  </p>
                  <div className="flex flex-col gap-1">
                    {rule.options.map((option) => {
                      const soldOut = option.stockQuantity <= 0;
                      return (
                        <div
                          key={option.id}
                          className="flex items-center justify-between rounded px-2 py-1.5 text-sm"
                        >
                          <span>{option.name}</span>
                          <span className={soldOut ? "text-red-400" : "text-xs text-[var(--pos-text-muted)]"}>
                            {soldOut ? "已送完" : `庫存 ${option.stockQuantity}`}
                          </span>
                        </div>
                      );
                    })}
                    {rule.options.length === 0 && (
                      <p className="text-xs text-[var(--pos-text-muted)]">尚未設定候選贈品</p>
                    )}
                  </div>
                </div>
              ))}
              {freebieRules.length === 0 && (
                <p className="text-sm text-[var(--pos-text-muted)]">此繪師目前沒有贈品活動</p>
              )}
            </div>
          </GlassCard>
        </div>
      )}
    </>
  );
}
