"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PosOrder } from "@/lib/pos-types";
import { processReturn } from "@/lib/actions/pos-returns";
import { GlassCard } from "@/components/pos/GlassCard";
import { GlowButton } from "@/components/pos/GlowButton";

const REASON_OPTIONS = ["換商品", "客人不要", "結錯帳", "商品瑕疵", "其他"];

export function PosReturnButton({ order }: { order: PosOrder }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const returnableItems = order.items.map((item) => ({
    ...item,
    remaining: item.quantity - item.returnedQuantity,
  }));
  const anyReturnable = returnableItems.some((i) => i.remaining > 0);

  function open() {
    setMessage(null);
    setQuantities({});
    setReason("");
    setIsOpen(true);
  }

  function setQty(orderItemId: string, qty: number, max: number) {
    setQuantities((prev) => ({ ...prev, [orderItemId]: Math.max(0, Math.min(qty, max)) }));
  }

  function selectAll() {
    const next: Record<string, number> = {};
    for (const item of returnableItems) {
      if (item.remaining > 0) next[item.id] = item.remaining;
    }
    setQuantities(next);
  }

  const refundPreview = returnableItems.reduce((sum, item) => sum + (quantities[item.id] ?? 0) * item.unitPrice, 0);
  const hasSelection = Object.values(quantities).some((q) => q > 0);

  function confirmReturn() {
    const items = Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .map(([orderItemId, quantity]) => ({ orderItemId, quantity }));
    if (items.length === 0) return;

    startTransition(async () => {
      const result = await processReturn({ orderId: order.id, reason: reason || null, items });
      setMessage(result.message);
      if (result.success) {
        router.refresh();
        setTimeout(() => setIsOpen(false), 1200);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        disabled={!anyReturnable}
        className="pos-input px-3 py-1.5 text-xs disabled:opacity-30"
      >
        退貨
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <GlassCard className="w-full max-w-lg">
            <h3 className="mb-1 text-lg font-semibold" style={{ color: "var(--pos-gold)" }}>
              退貨：{order.orderNumber}
            </h3>
            <p className="mb-3 text-xs text-[var(--pos-text-muted)]">
              整張訂單退貨請按「全選」；單一品項退貨只勾要退的商品。換貨的話，這裡先退掉舊商品，
              新商品請直接到 POS 收銀畫面重新結帳，退款金額可以跟新訂單金額核對差額。
            </p>

            <div className="flex flex-col gap-2">
              {returnableItems.map((item) => (
                <div key={item.id} className="pos-input flex items-center justify-between gap-2 p-2 text-sm">
                  <div className="flex-1">
                    <p>
                      {item.groupName}
                      {item.variantName && <span> - {item.variantName}</span>}
                      {item.isFreebie && <span className="ml-1 text-xs" style={{ color: "var(--pos-gold)" }}>（贈品）</span>}
                    </p>
                    <p className="text-xs text-[var(--pos-text-muted)]">
                      單價 NT${item.unitPrice}｜原數量 {item.quantity}｜已退 {item.returnedQuantity}｜可退{" "}
                      {item.remaining}
                    </p>
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={item.remaining}
                    disabled={item.remaining <= 0}
                    value={quantities[item.id] ?? 0}
                    onChange={(e) => setQty(item.id, Number(e.target.value), item.remaining)}
                    className="pos-input w-16 px-2 py-1 text-center"
                  />
                </div>
              ))}
            </div>

            <button type="button" onClick={selectAll} className="pos-input mt-2 px-3 py-1.5 text-xs">
              全選（整張訂單退貨）
            </button>

            <div className="mt-3 flex flex-col gap-1">
              <label className="text-xs text-[var(--pos-text-muted)]">退貨原因（選填）</label>
              <select value={reason} onChange={(e) => setReason(e.target.value)} className="pos-input px-3 py-2 text-sm">
                <option value="" className="bg-[#1a1140]">
                  不指定
                </option>
                {REASON_OPTIONS.map((r) => (
                  <option key={r} value={r} className="bg-[#1a1140]">
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-3 flex items-center justify-between text-sm">
              <span>預計退款</span>
              <span className="text-lg font-bold" style={{ color: "var(--pos-gold)" }}>
                NT$ {refundPreview}
              </span>
            </div>

            {message && <p className="mt-2 text-sm" style={{ color: "var(--pos-gold)" }}>{message}</p>}

            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setIsOpen(false)} className="pos-input flex-1 py-2 text-sm">
                取消
              </button>
              <GlowButton onClick={confirmReturn} disabled={!hasSelection || isPending} className="flex-1 py-2">
                {isPending ? "處理中..." : "確認退貨"}
              </GlowButton>
            </div>
          </GlassCard>
        </div>
      )}
    </>
  );
}
