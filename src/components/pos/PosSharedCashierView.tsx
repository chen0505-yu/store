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

export interface PosSharedArtistSection {
  artistId: string;
  artistName: string;
  groups: PosProductGroup[];
  freebieRules: PosFreebieRule[];
}

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

// 共用攤位收銀畫面：同一頁依 Artist 分區顯示商品，上方篩選只影響「看到哪些商品」，
// 不會清空購物車；購物車、贈品額度計算、結帳，都是跨 Artist 共用同一份狀態，
// 但贈品額度池仍然分別依各自的 Artist 商品小計獨立計算（不會把整單金額算給某一位）。
// 細項/庫存/售完顯示邏輯完全沿用 PosCashierView 同一套 helper，不重寫一份。
export function PosSharedCashierView({
  eventId,
  groupId,
  groupName,
  artistSections,
}: {
  eventId: string;
  groupId: string;
  groupName: string;
  artistSections: PosSharedArtistSection[];
}) {
  const router = useRouter();
  const [cart, setCart] = useState<PosCartLine[]>([]);
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  const [freebieSlots, setFreebieSlots] = useState<FreebieSlot[]>([]);
  const [selectedOptionIds, setSelectedOptionIds] = useState<Record<string, string | null>>({});
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

  const allFreebieRules = useMemo(() => artistSections.flatMap((s) => s.freebieRules), [artistSections]);

  function artistSubtotalOf(artistId: string, cartLines: PosCartLine[]) {
    return cartLines.filter((l) => l.artistId === artistId).reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  }

  function findRuleSection(optionId: string) {
    for (const section of artistSections) {
      const rule = section.freebieRules.find((r) => r.options.some((o) => o.id === optionId));
      if (rule) return { rule, section };
    }
    return null;
  }

  function addPoolPick(optionId: string) {
    const found = findRuleSection(optionId);
    if (!found) return;
    const { rule, section } = found;
    const option = rule.options.find((o) => o.id === optionId);
    if (!rule.thresholdAmount || !option) return;
    const pickedCount = poolPicks.filter((id) => id === optionId).length;
    if (pickedCount >= option.stockQuantity) return;
    const artistSubtotal = artistSubtotalOf(section.artistId, cart);
    const artistQuotaUsed = computeQuotaUsed(poolPicks, section.freebieRules);
    if (artistQuotaUsed + rule.thresholdAmount > artistSubtotal) return;
    setPoolPicks((prev) => [...prev, optionId]);
  }

  function removePoolPick(optionId: string) {
    setPoolPicks((prev) => {
      const idx = prev.indexOf(optionId);
      if (idx === -1) return prev;
      return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
    });
  }

  function addToCart(group: PosProductGroup, artistId: string, artistName: string) {
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
          artistId,
          artistName,
        },
      ];
    });
  }

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
    const eligible = computeEligibleFreebieSlots(cart, allFreebieRules);
    const slots = expandSlots(eligible);
    setFreebieSlots(slots);
    setSelectedOptionIds({});
    setPoolPicks([]);
    const hasPoolOptions = artistSections.some((section) => {
      const artistSubtotal = artistSubtotalOf(section.artistId, cart);
      return getQuotaPoolRules(section.freebieRules).some((r) => (r.thresholdAmount ?? Infinity) <= artistSubtotal);
    });
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
    // p_artist_id 只是「代表 Artist」快照，用購物車第一項商品的所屬 Artist；每個 item
    // 實際歸屬由 pos_checkout() 依 group_id 自動解析，不受這個代表值影響。
    const representativeArtistId = cart[0]?.artistId ?? artistSections[0]?.artistId ?? "";
    startTransition(async () => {
      const result = await checkoutPosOrder({
        eventId,
        artistId: representativeArtistId,
        receivedAmount: received,
        items: cart.map((l) => ({ groupId: l.groupId, quantity: l.quantity })),
        freebieOptionIds,
        sharedGroupId: groupId,
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

  const visibleSections = artistSections.filter((s) => activeFilter === "all" || s.artistId === activeFilter);

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
              <p>
                {line.groupName}
                {line.artistName && (
                  <span className="ml-1.5 text-xs" style={{ color: "var(--pos-gold)" }}>
                    ［{line.artistName}］
                  </span>
                )}
              </p>
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
          <h2 className="text-lg font-semibold">共用攤位・{groupName}</h2>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveFilter("all")}
            className={activeFilter === "all" ? "pos-glow-btn px-3 py-1.5 text-sm" : "pos-input px-3 py-1.5 text-sm"}
          >
            全部
          </button>
          {artistSections.map((section) => (
            <button
              key={section.artistId}
              type="button"
              onClick={() => setActiveFilter(section.artistId)}
              className={
                activeFilter === section.artistId ? "pos-glow-btn px-3 py-1.5 text-sm" : "pos-input px-3 py-1.5 text-sm"
              }
            >
              {section.artistName}
            </button>
          ))}
        </div>

        {successMessage && (
          <p className="mb-3 rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(233,196,106,0.12)", color: "var(--pos-gold-strong)" }}>
            {successMessage}
          </p>
        )}

        {visibleSections.map((section) => (
          <div key={section.artistId} className="mb-6">
            <h3 className="mb-2 text-sm font-semibold" style={{ color: "var(--pos-gold)" }}>
              {section.artistName}
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
              {section.groups.map((group) => {
                const soldOut = isGroupSoldOut(group);
                const stock = getEffectiveStock(group);
                return (
                  <button
                    key={group.id}
                    type="button"
                    disabled={soldOut}
                    onClick={() => addToCart(group, section.artistId, section.artistName)}
                    className={`pos-glass flex flex-col overflow-hidden p-0 text-left ${
                      soldOut ? "pos-card-soldout cursor-not-allowed" : "cursor-pointer hover:scale-[1.02]"
                    } transition`}
                  >
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
            {section.groups.length === 0 && (
              <p className="text-sm text-[var(--pos-text-muted)]">這位繪師目前沒有可販售的商品。</p>
            )}
          </div>
        ))}
      </div>

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

      {isMobileCartOpen && (
        <div className="fixed inset-0 z-30 bg-black/60 md:hidden" onClick={() => setIsMobileCartOpen(false)} />
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
              每位 Artist 的贈品額度分開計算，只能用該 Artist 自己的商品小計兌換；選完會一起進入同一次現金結帳。
            </p>
            <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto">
              {artistSections.map((section) => {
                const artistCartLines = cart.filter((l) => l.artistId === section.artistId);
                const poolRules = getQuotaPoolRules(section.freebieRules);
                if (artistCartLines.length === 0 || poolRules.length === 0) return null;

                const artistSubtotal = artistSubtotalOf(section.artistId, cart);
                const quotaUsed = computeQuotaUsed(poolPicks, section.freebieRules);
                const quotaRemaining = artistSubtotal - quotaUsed;

                return (
                  <div key={section.artistId} className="pos-input p-3">
                    <p className="mb-2 text-sm font-semibold" style={{ color: "var(--pos-gold)" }}>
                      {section.artistName} 的贈品額度
                    </p>
                    <div className="mb-3 grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-xs text-[var(--pos-text-muted)]">可用額度</p>
                        <p className="text-base font-semibold">NT$ {artistSubtotal}</p>
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
                    </div>
                  </div>
                );
              })}
              {freebieSlots.map((slot) => {
                const chosenElsewhere = (optionId: string) =>
                  Object.entries(selectedOptionIds).filter(
                    ([sid, oid]) => sid !== slot.slotId && oid === optionId
                  ).length;
                return (
                  <div key={slot.slotId} className="pos-input p-3">
                    <p className="mb-2 text-sm font-semibold">
                      {artistSections.find((s) => s.artistId === slot.rule.artistId)?.artistName}・{slot.rule.name}
                    </p>
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
            <p className="mb-2 text-sm text-[var(--pos-text-muted)]">應收金額（整單，只收一次）</p>
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
