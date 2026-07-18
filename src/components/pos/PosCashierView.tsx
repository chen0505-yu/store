"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { PosProductGroup, PosCartLine, PosFreebieRule } from "@/lib/pos-types";
import { getEffectiveStock, isGroupSoldOut } from "@/lib/pos-product-stock";
import {
  computeEligibleFreebieSlots,
  getQuotaPoolRules,
  computeQuotaUsed,
  type PosFreebieEligibleSlot,
} from "@/lib/pos-freebie-eligibility";
import { checkoutPosOrder } from "@/lib/actions/pos-orders";
import { GlassCard } from "@/components/pos/GlassCard";
import { GlowButton } from "@/components/pos/GlowButton";
import { PosFreebiePreviewButton } from "@/components/pos/PosFreebiePreviewButton";

// 一個「贈品名額」：某條規則賺到的其中一次資格，小幫手可以從候選裡選一款，也可以跳過不拿。
interface FreebieSlot {
  slotId: string;
  rule: PosFreebieRule;
}

function expandSlots(eligible: PosFreebieEligibleSlot[]): FreebieSlot[] {
  const slots: FreebieSlot[] = [];
  for (const { rule, earnedCount } of eligible) {
    for (let i = 0; i < earnedCount; i++) {
      slots.push({ slotId: `${rule.id}::${i}`, rule });
    }
  }
  return slots;
}

// POS 收銀只到商品主項層級，完全不用選細項（小幫手不一定認得角色）。
// 細項只在後台商品管理／統計裡看得到，這個畫面刻意不知道細項的存在。
//
// 響應式：手機（<md）購物車預設收起來，用畫面下方的浮動列打開成下滑面板；
// 平板／筆電（≥md）維持左右分欄，購物車一直顯示在右側。斷點用 md（768px）
// 而不是 lg，因為平板直向/橫向大多落在 768~1024px，要讓平板也拿到左右分欄。
export function PosCashierView({
  eventId,
  artistId,
  artistName,
  groups,
  freebieRules,
}: {
  eventId: string;
  artistId: string;
  artistName: string;
  groups: PosProductGroup[];
  freebieRules: PosFreebieRule[];
}) {
  const router = useRouter();
  const [cart, setCart] = useState<PosCartLine[]>([]);
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  const [freebieSlots, setFreebieSlots] = useState<FreebieSlot[]>([]);
  const [selectedOptionIds, setSelectedOptionIds] = useState<Record<string, string | null>>({});
  // 額度池模式：已選的贈品 optionId 清單，可重複（同一款選兩次就出現兩次）。
  const [poolPicks, setPoolPicks] = useState<string[]>([]);
  const [isGiftStepOpen, setIsGiftStepOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [receivedInput, setReceivedInput] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const total = useMemo(() => cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0), [cart]);
  const itemCount = useMemo(() => cart.reduce((sum, line) => sum + line.quantity, 0), [cart]);
  const received = Number(receivedInput) || 0;
  const change = received - total;

  const poolRules = useMemo(() => getQuotaPoolRules(freebieRules), [freebieRules]);
  const quotaUsed = useMemo(() => computeQuotaUsed(poolPicks, freebieRules), [poolPicks, freebieRules]);
  const quotaRemaining = total - quotaUsed;

  function addPoolPick(optionId: string) {
    const rule = freebieRules.find((r) => r.options.some((o) => o.id === optionId));
    const option = rule?.options.find((o) => o.id === optionId);
    if (!rule?.thresholdAmount || !option) return;
    const pickedCount = poolPicks.filter((id) => id === optionId).length;
    if (pickedCount >= option.stockQuantity) return;
    if (quotaUsed + rule.thresholdAmount > total) return;
    setPoolPicks((prev) => [...prev, optionId]);
  }

  function removePoolPick(optionId: string) {
    setPoolPicks((prev) => {
      const idx = prev.indexOf(optionId);
      if (idx === -1) return prev;
      return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
    });
  }

  function addToCart(group: PosProductGroup) {
    if (isGroupSoldOut(group)) return;
    setSuccessMessage(null);
    const stockCeiling = getEffectiveStock(group);
    setCart((prev) => {
      const existing = prev.find((l) => l.groupId === group.id);
      if (existing) {
        if (existing.quantity >= stockCeiling) return prev;
        return prev.map((l) => (l.groupId === group.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [
        ...prev,
        {
          groupId: group.id,
          groupName: group.name,
          unitPrice: group.price,
          quantity: 1,
          stockQuantity: stockCeiling,
          note: group.note,
        },
      ];
    });
  }

  // 給 +/- 按鈕與直接輸入數字共用：quantity <= 0 直接移除該商品，其餘 clamp 在 [1, 庫存] 之間。
  function setQuantity(groupId: string, quantity: number) {
    setCart((prev) => {
      if (quantity <= 0) return prev.filter((l) => l.groupId !== groupId);
      return prev.map((l) => (l.groupId === groupId ? { ...l, quantity: Math.min(quantity, l.stockQuantity) } : l));
    });
  }

  function removeLine(groupId: string) {
    setCart((prev) => prev.filter((l) => l.groupId !== groupId));
  }

  function openCheckout() {
    if (cart.length === 0) return;
    setErrorMessage(null);
    // spend_threshold 規則一律走下面的額度池 UI；這裡的固定名額只剩 buy_product。
    const eligible = computeEligibleFreebieSlots(cart, freebieRules);
    const slots = expandSlots(eligible);
    setFreebieSlots(slots);
    setSelectedOptionIds({});
    setPoolPicks([]);
    const hasPoolOptions = poolRules.some((r) => (r.thresholdAmount ?? Infinity) <= total);
    if (slots.length > 0 || hasPoolOptions) {
      setIsGiftStepOpen(true);
    } else {
      setReceivedInput("");
      setIsCheckoutOpen(true);
    }
  }

  function proceedToPayment() {
    setIsGiftStepOpen(false);
    setReceivedInput("");
    setIsCheckoutOpen(true);
  }

  function confirmCheckout() {
    if (received < total) return;
    setErrorMessage(null);
    const slotPicks = Object.values(selectedOptionIds).filter((id): id is string => Boolean(id));
    const freebieOptionIds = [...slotPicks, ...poolPicks];
    startTransition(async () => {
      const result = await checkoutPosOrder({
        eventId,
        artistId,
        receivedAmount: received,
        items: cart.map((l) => ({ groupId: l.groupId, quantity: l.quantity })),
        freebieOptionIds,
      });
      if (result.success) {
        setSuccessMessage(`結帳完成！訂單編號 ${result.orderNumber}，找零 NT$ ${change}`);
        setCart([]);
        setFreebieSlots([]);
        setSelectedOptionIds({});
        setPoolPicks([]);
        setIsCheckoutOpen(false);
        setIsMobileCartOpen(false);
        router.refresh();
      } else {
        setErrorMessage(result.message);
      }
    });
  }

  const cartContent = (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">購物車（{itemCount} 件）</h2>
        <button
          type="button"
          onClick={() => setIsMobileCartOpen(false)}
          className="pos-input h-9 w-9 rounded-full text-sm md:hidden"
        >
          ✕
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {cart.length === 0 && <p className="text-sm text-[var(--pos-text-muted)]">尚未加入商品</p>}
        {cart.map((line) => (
          <div key={line.groupId} className="flex items-center justify-between gap-2 text-sm">
            <div className="flex-1">
              <p>{line.groupName}</p>
              <p className="text-xs text-[var(--pos-text-muted)]">
                NT$ {line.unitPrice} ｜ 小計 NT$ {line.unitPrice * line.quantity}
              </p>
              {line.note && (
                <p className="text-xs" style={{ color: "var(--pos-gold-strong)" }}>
                  ⚠ {line.note}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setQuantity(line.groupId, line.quantity - 1)}
                className="pos-input h-9 w-9 shrink-0 rounded text-base"
              >
                −
              </button>
              <input
                type="number"
                min={0}
                max={line.stockQuantity}
                value={line.quantity}
                onChange={(e) => setQuantity(line.groupId, Number(e.target.value))}
                className="pos-input h-9 w-14 shrink-0 rounded text-center text-base"
              />
              <button
                type="button"
                onClick={() => setQuantity(line.groupId, line.quantity + 1)}
                disabled={line.quantity >= line.stockQuantity}
                className="pos-input h-9 w-9 shrink-0 rounded text-base disabled:opacity-30"
              >
                +
              </button>
            </div>
            <button
              type="button"
              onClick={() => removeLine(line.groupId)}
              className="shrink-0 text-xs text-[var(--pos-text-muted)] hover:text-red-400"
            >
              移除
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-[var(--pos-glass-border)] pt-3 text-lg font-bold">
        <span>總金額</span>
        <span style={{ color: "var(--pos-gold)" }}>NT$ {total}</span>
      </div>
      <GlowButton onClick={openCheckout} disabled={cart.length === 0} className="py-3.5 text-base">
        結帳
      </GlowButton>
    </>
  );

  return (
    <div className="flex flex-col gap-4 pb-20 md:flex-row md:pb-0">
      <div className="flex-1">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{artistName} 的商品</h2>
          <PosFreebiePreviewButton artistName={artistName} freebieRules={freebieRules} groups={groups} />
        </div>
        {successMessage && (
          <p className="mb-3 rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(233,196,106,0.12)", color: "var(--pos-gold-strong)" }}>
            {successMessage}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {groups.map((group) => {
            const soldOut = isGroupSoldOut(group);
            const stock = getEffectiveStock(group);
            return (
              <button
                key={group.id}
                type="button"
                disabled={soldOut}
                onClick={() => addToCart(group)}
                className={`pos-glass flex flex-col overflow-hidden p-0 text-left ${
                  soldOut ? "pos-card-soldout cursor-not-allowed" : "cursor-pointer hover:scale-[1.02]"
                } transition`}
              >
                {/* 圖片區用 aspect-square 固定成「跟卡片同寬的正方形」（不是跟卡片總高綁定），
                    下面文字區另外給固定高度 h-[76px]（夠放兩行商品名稱＋一行金額/庫存，不會被擠壓裁切）。
                    這兩塊高度相加，同一個中斷點（欄數）下每張卡片還是等寬等高；只是整張卡片
                    不再強制是正方形——這是刻意的，商品名稱不能被裁掉，比卡片正方形更優先。 */}
                <div className="relative flex aspect-square w-full shrink-0 items-center justify-center overflow-hidden bg-black/30">
                  {group.imageUrl ? (
                    <Image
                      src={group.imageUrl}
                      alt={group.name}
                      fill
                      sizes="(min-width: 1024px) 220px, (min-width: 640px) 25vw, 45vw"
                      className="object-contain object-center"
                    />
                  ) : (
                    <span className="text-xs text-[var(--pos-text-muted)]">無圖片</span>
                  )}
                </div>
                <div className="flex h-[76px] shrink-0 flex-col justify-center gap-1 overflow-hidden px-2 py-1.5">
                  <span className="line-clamp-2 text-sm leading-tight font-medium">{group.name}</span>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-sm font-semibold" style={{ color: "var(--pos-gold)" }}>
                      NT$ {group.price}
                    </span>
                    <span className="shrink-0 text-xs text-[var(--pos-text-muted)]">
                      {soldOut ? <span className="text-red-400">售完</span> : `庫存 ${stock}`}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        {groups.length === 0 && (
          <p className="text-sm text-[var(--pos-text-muted)]">這位繪師目前沒有可販售的商品。</p>
        )}
      </div>

      {/* 手機版購物車浮動列：平板/筆電（md 以上）不需要，購物車一直顯示在右側 */}
      {cart.length > 0 && !isMobileCartOpen && (
        <button
          type="button"
          onClick={() => setIsMobileCartOpen(true)}
          className="pos-glow-btn fixed inset-x-4 bottom-4 z-30 flex items-center justify-between px-5 py-3.5 text-base md:hidden"
        >
          <span>查看購物車（{itemCount} 件）</span>
          <span>NT$ {total}</span>
        </button>
      )}

      {/* 手機版下滑面板背景遮罩 */}
      {isMobileCartOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          onClick={() => setIsMobileCartOpen(false)}
        />
      )}

      <GlassCard
        className={`${
          isMobileCartOpen ? "fixed inset-x-0 bottom-0 z-40 max-h-[85vh] overflow-y-auto rounded-b-none" : "hidden"
        } flex w-full flex-col gap-3 md:static md:z-auto md:flex md:max-h-none md:w-80 md:overflow-visible md:rounded-2xl`}
      >
        {cartContent}
      </GlassCard>

      {isGiftStepOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <GlassCard className="w-full max-w-md">
            <h3 className="mb-1 text-lg font-semibold" style={{ color: "var(--pos-gold)" }}>
              選擇贈品
            </h3>
            <p className="mb-4 text-xs text-[var(--pos-text-muted)]">
              購物車金額是可用額度，每選一款贈品就會扣掉對應的消耗額度，可以自由組合，也可以都不選。
            </p>
            <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto">
              <div className="pos-input p-3">
                <div className="mb-3 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-xs text-[var(--pos-text-muted)]">可用額度</p>
                    <p className="text-base font-semibold">NT$ {total}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--pos-text-muted)]">已使用</p>
                    <p className="text-base font-semibold">NT$ {quotaUsed}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--pos-text-muted)]">剩餘額度</p>
                    <p className="text-base font-semibold" style={{ color: "var(--pos-gold)" }}>
                      NT$ {quotaRemaining}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  {poolRules.flatMap((rule) =>
                    rule.options.map((option) => {
                      const label = rule.options.length > 1 ? `${rule.name}・${option.name}` : rule.name;
                      const pickedCount = poolPicks.filter((id) => id === option.id).length;
                      const remainingStock = option.stockQuantity - pickedCount;
                      const insufficientQuota = quotaRemaining < (rule.thresholdAmount ?? 0);
                      const addDisabled = remainingStock <= 0 || insufficientQuota;
                      return (
                        <div key={option.id} className="pos-input flex items-center justify-between gap-3 rounded px-3 py-2.5 text-sm">
                          <div>
                            <p className="font-medium">{label}</p>
                            <p className="text-xs text-[var(--pos-text-muted)]">
                              消耗 NT$ {rule.thresholdAmount}｜庫存 {remainingStock}
                              {remainingStock <= 0 ? "（售完）" : insufficientQuota ? "（額度不足）" : ""}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <button
                              type="button"
                              disabled={pickedCount === 0}
                              onClick={() => removePoolPick(option.id)}
                              className="pos-input h-8 w-8 rounded text-base disabled:opacity-30"
                            >
                              −
                            </button>
                            <span className="w-5 text-center">{pickedCount}</span>
                            <button
                              type="button"
                              disabled={addDisabled}
                              onClick={() => addPoolPick(option.id)}
                              className={`h-8 w-8 rounded text-base ${
                                addDisabled ? "pos-card-soldout cursor-not-allowed" : "pos-glow-btn"
                              }`}
                            >
                              ＋
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                  {poolRules.length === 0 && (
                    <p className="text-xs text-[var(--pos-text-muted)]">這位繪師尚未設定額度池贈品規則</p>
                  )}
                </div>
              </div>
              {freebieSlots.map((slot) => {
                const chosenElsewhere = (optionId: string) =>
                  Object.entries(selectedOptionIds).filter(
                    ([sid, oid]) => sid !== slot.slotId && oid === optionId
                  ).length;
                return (
                  <div key={slot.slotId} className="pos-input p-3">
                    <p className="mb-2 text-sm font-semibold">{slot.rule.name}</p>
                    <div className="flex flex-col gap-1">
                      {slot.rule.options.map((option) => {
                        const remaining = option.stockQuantity - chosenElsewhere(option.id);
                        const disabled = remaining <= 0;
                        const selected = selectedOptionIds[slot.slotId] === option.id;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            disabled={disabled}
                            onClick={() => setSelectedOptionIds((prev) => ({ ...prev, [slot.slotId]: option.id }))}
                            className={`flex items-center justify-between rounded px-3 py-2.5 text-sm ${
                              disabled
                                ? "pos-card-soldout cursor-not-allowed"
                                : selected
                                  ? "pos-glow-btn"
                                  : "pos-input cursor-pointer hover:brightness-125"
                            }`}
                          >
                            <span>{option.name}</span>
                            <span className="text-xs">{disabled ? "售完" : `剩 ${remaining}`}</span>
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => setSelectedOptionIds((prev) => ({ ...prev, [slot.slotId]: null }))}
                        className={`rounded px-3 py-2.5 text-sm ${
                          !selectedOptionIds[slot.slotId] ? "pos-glow-btn" : "pos-input"
                        }`}
                      >
                        不要這個贈品
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <GlowButton onClick={proceedToPayment} className="mt-4 w-full py-3 text-base">
              下一步：現金結帳
            </GlowButton>
          </GlassCard>
        </div>
      )}

      {isCheckoutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <GlassCard className="w-full max-w-sm">
            <h3 className="mb-4 text-lg font-semibold" style={{ color: "var(--pos-gold)" }}>
              現金結帳
            </h3>
            <p className="mb-2 text-sm text-[var(--pos-text-muted)]">應收金額</p>
            <p className="mb-4 text-2xl font-bold">NT$ {total}</p>
            <label className="mb-1 block text-xs text-[var(--pos-text-muted)]">收款金額</label>
            <input
              type="number"
              autoFocus
              className="pos-input mb-3 w-full px-3 py-3 text-lg"
              value={receivedInput}
              onChange={(e) => setReceivedInput(e.target.value)}
            />
            <p className="mb-4 text-sm">
              找零：<span className="font-semibold">{change >= 0 ? `NT$ ${change}` : "金額不足"}</span>
            </p>
            {errorMessage && <p className="mb-3 text-sm text-red-400">{errorMessage}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsCheckoutOpen(false)}
                className="pos-input flex-1 py-3 text-sm"
              >
                取消
              </button>
              <GlowButton
                onClick={confirmCheckout}
                disabled={received < total || isPending}
                className="flex-1 py-3 text-base"
              >
                {isPending ? "處理中..." : "確認結帳"}
              </GlowButton>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
