"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useInstockCart } from "@/lib/cart/use-instock-cart";
import { createInstockOrder, type BonusSelectionInput } from "@/lib/actions/orders";
import {
  getInstockBlindDrawOptionsForGroups,
  type InstockBlindDrawGroupConfig,
} from "@/lib/actions/instock-shop";
import { BLACKLIST_MESSAGE } from "@/lib/product-availability";

export function InstockCartView({
  isLoggedIn,
  isBlacklisted,
}: {
  isLoggedIn: boolean;
  isBlacklisted: boolean;
}) {
  const { items, updateQuantity, removeItem, clear } = useInstockCart();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [blindDrawConfigs, setBlindDrawConfigs] = useState<InstockBlindDrawGroupConfig[]>([]);
  const [bonusSelections, setBonusSelections] = useState<Record<string, string[]>>({});

  const total = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

  const groupIds = Array.from(new Set(items.map((i) => i.groupId)));
  const groupIdsKey = groupIds.slice().sort().join(",");

  // 購物車內容改變時（含結帳完成清空），重新查詢哪些品項開啟了盲抽/滿抽選品。
  useEffect(() => {
    let active = true;
    getInstockBlindDrawOptionsForGroups(groupIds).then((configs) => {
      if (active) setBlindDrawConfigs(configs);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupIdsKey]);

  const groupQtyMap = new Map<string, { name: string; qty: number }>();
  for (const item of items) {
    const existing = groupQtyMap.get(item.groupId);
    if (existing) {
      existing.qty += item.quantity;
    } else {
      groupQtyMap.set(item.groupId, { name: item.groupName, qty: item.quantity });
    }
  }

  function toggleBonusVariant(groupId: string, variantId: string, allowed: number) {
    setBonusSelections((prev) => {
      const current = prev[groupId] ?? [];
      if (current.includes(variantId)) {
        return { ...prev, [groupId]: current.filter((id) => id !== variantId) };
      }
      if (current.length >= allowed) return prev;
      return { ...prev, [groupId]: [...current, variantId] };
    });
  }

  function handleSubmit() {
    const bonusPayload: BonusSelectionInput[] = Object.entries(bonusSelections).flatMap(
      ([groupId, variantIds]) => variantIds.map((variantId) => ({ groupId, variantId }))
    );

    startTransition(async () => {
      const result = await createInstockOrder(items, customerName, bonusPayload);
      if (result.success) {
        clear();
        setCustomerName("");
        setBonusSelections({});
        setMessage(`${result.message}（訂單編號：${result.orderNumber}）`);
      } else {
        setMessage(result.message);
      }
    });
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-pink-600">現貨購物車</h1>

      {message && (
        <div className="mb-4 rounded-2xl bg-pink-50 p-4 text-sm text-pink-700">
          {message}
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-zinc-500">
          購物車是空的，先去{" "}
          <Link href="/instock" className="text-pink-600 underline">
            現貨專區
          </Link>{" "}
          逛逛吧。
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <li
                key={item.variantId}
                className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.imageUrl}
                      alt={item.groupName}
                      className="h-16 w-16 shrink-0 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-xl">
                      🦝
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-purple-400">{item.teacherName}</p>
                    <p className="font-medium text-zinc-800">
                      {item.groupName} - {item.variantName}
                    </p>
                    <p className="text-sm text-pink-600">
                      NT$ {item.unitPrice} × {item.quantity}
                    </p>
                    <p className="text-xs text-zinc-400">小計 NT$ {item.unitPrice * item.quantity}</p>
                    <p className="text-xs text-zinc-400">庫存上限 {item.stockQuantity}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={item.stockQuantity}
                    value={item.quantity}
                    onChange={(e) =>
                      updateQuantity(
                        item.variantId,
                        Math.min(item.stockQuantity, Math.max(1, Number(e.target.value)))
                      )
                    }
                    className="w-16 rounded-lg border border-pink-200 px-2 py-1 text-center"
                  />
                  <button
                    onClick={() => removeItem(item.variantId)}
                    className="text-sm text-zinc-400 hover:text-red-500"
                  >
                    移除
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {blindDrawConfigs.length > 0 && (
            <div className="mt-4 flex flex-col gap-3">
              {blindDrawConfigs.map((config) => {
                const groupInfo = groupQtyMap.get(config.groupId);
                if (!groupInfo || groupInfo.qty < config.thresholdQty || config.options.length === 0) {
                  return null;
                }
                const allowed = Math.floor(groupInfo.qty / config.thresholdQty) * config.pickQty;
                const selected = bonusSelections[config.groupId] ?? [];
                return (
                  <div key={config.groupId} className="rounded-2xl bg-pink-50 p-4">
                    <p className="text-sm font-semibold text-pink-700">
                      {groupInfo.name} 可選保底（每買 {config.thresholdQty} 件選 {config.pickQty} 個，已選{" "}
                      {selected.length}／{allowed}）
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {config.options.map((opt) => {
                        const isSelected = selected.includes(opt.variantId);
                        const soldOut = opt.stockQuantity <= 0;
                        const disabled = soldOut || (!isSelected && selected.length >= allowed);
                        return (
                          <button
                            key={opt.variantId}
                            type="button"
                            onClick={() => toggleBonusVariant(config.groupId, opt.variantId, allowed)}
                            disabled={disabled}
                            className={`rounded-full px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${
                              isSelected
                                ? "bg-pink-500 text-white"
                                : "border border-pink-200 bg-white text-pink-600"
                            }`}
                          >
                            {opt.variantName}
                            {soldOut ? "（已售完）" : ""}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!isLoggedIn ? (
            <div className="mt-6 rounded-2xl bg-pink-50 p-4 text-sm text-pink-700">
              請先{" "}
              <Link href="/login" className="underline">
                登入
              </Link>{" "}
              或{" "}
              <Link href="/register" className="underline">
                註冊
              </Link>{" "}
              會員才能送出訂單。
            </div>
          ) : isBlacklisted ? (
            <div className="mt-6 rounded-2xl bg-red-50 p-4 text-sm text-red-600">
              {BLACKLIST_MESSAGE}
            </div>
          ) : (
            <div className="mt-6 flex flex-col gap-1">
              <label className="text-xs text-zinc-500">客戶名稱 *（出貨單會顯示）</label>
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="請輸入收件人姓名"
                className="rounded-lg border border-pink-200 px-3 py-2"
              />
            </div>
          )}

          <div className="mt-4 flex items-center justify-between">
            <span className="text-lg font-semibold text-zinc-700">
              總計 NT$ {total}
            </span>
            {isLoggedIn && !isBlacklisted && (
              <button
                onClick={handleSubmit}
                disabled={isPending || !customerName.trim()}
                className="rounded-full bg-gradient-to-r from-pink-400 to-purple-400 px-6 py-2 font-semibold text-white disabled:opacity-50"
              >
                {isPending ? "送出中..." : "送出現貨訂單"}
              </button>
            )}
          </div>
          <p className="mt-2 text-xs text-zinc-400">
            送出後請至會員中心查看訂單狀態，並前往賣貨便完成付款。
          </p>
        </>
      )}
    </div>
  );
}
