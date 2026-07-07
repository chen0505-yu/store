"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePreorderCart } from "@/lib/cart/use-preorder-cart";
import { createPreorderOrder, type BonusSelectionInput, type PickupInput } from "@/lib/actions/orders";
import { getBlindDrawOptionsForGroups, type BlindDrawGroupConfig } from "@/lib/actions/teacher-shop";
import {
  getEventPickupEligibleTeacherIds,
  getEventPickupOptionsForTeachers,
  type TeacherEventPickupConfig,
} from "@/lib/actions/teachers";
import { BLACKLIST_MESSAGE } from "@/lib/product-availability";
import { PaymentAccountInfo } from "@/components/PaymentAccountInfo";
import type { PaymentSettingsView } from "@/lib/data/payment-settings";

export function PreorderCartView({
  isLoggedIn,
  isBlacklisted,
  paymentSettings,
}: {
  isLoggedIn: boolean;
  isBlacklisted: boolean;
  paymentSettings: PaymentSettingsView | null;
}) {
  const { items, updateQuantity, removeItem, clear } = usePreorderCart();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [orderCompleted, setOrderCompleted] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [blindDrawConfigs, setBlindDrawConfigs] = useState<BlindDrawGroupConfig[]>([]);
  const [bonusSelections, setBonusSelections] = useState<Record<string, string[]>>({});
  const [eventPickupConfigs, setEventPickupConfigs] = useState<TeacherEventPickupConfig[]>([]);
  const [eligibleTeacherIds, setEligibleTeacherIds] = useState<string[]>([]);
  const [pickupMethod, setPickupMethod] = useState<"shipment" | "event_pickup">("shipment");
  const [eventPickupOptionId, setEventPickupOptionId] = useState("");

  const total = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

  const groupIds = Array.from(new Set(items.map((i) => i.productGroupId)));
  const groupIdsKey = groupIds.slice().sort().join(",");
  const teacherIds = Array.from(new Set(items.map((i) => i.teacherId)));
  const teacherIdsKey = teacherIds.slice().sort().join(",");

  // 購物車內容改變時（含結帳完成清空），重新查詢哪些品項開啟了盲抽/滿抽選品。
  useEffect(() => {
    let active = true;
    getBlindDrawOptionsForGroups(groupIds).then((configs) => {
      if (active) setBlindDrawConfigs(configs);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupIdsKey]);

  // 同樣的道理，重新查詢購物車裡的老師之中，哪些開放活動現場取貨，以及哪些完全沒開放
  // （用來偵測購物車是否同時混了可現場取貨／不可現場取貨的商品，混到就要擋下結帳）。
  useEffect(() => {
    let active = true;
    Promise.all([
      getEventPickupOptionsForTeachers(teacherIds),
      getEventPickupEligibleTeacherIds(teacherIds),
    ]).then(([configs, eligibleIds]) => {
      if (active) {
        setEventPickupConfigs(configs);
        setEligibleTeacherIds(eligibleIds);
        setPickupMethod("shipment");
        setEventPickupOptionId("");
      }
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherIdsKey]);

  const ineligibleItemsExist = items.some((i) => !eligibleTeacherIds.includes(i.teacherId));
  const eligibleItemsExist = items.some((i) => eligibleTeacherIds.includes(i.teacherId));
  const isMixedPickupCart = ineligibleItemsExist && eligibleItemsExist;

  const groupQtyMap = new Map<string, { name: string; qty: number }>();
  for (const item of items) {
    const existing = groupQtyMap.get(item.productGroupId);
    if (existing) {
      existing.qty += item.quantity;
    } else {
      groupQtyMap.set(item.productGroupId, { name: item.productGroupName, qty: item.quantity });
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
    const pickupPayload: PickupInput =
      pickupMethod === "event_pickup"
        ? { method: "event_pickup", eventPickupOptionId }
        : { method: "shipment" };

    startTransition(async () => {
      const result = await createPreorderOrder(items, customerName, bonusPayload, pickupPayload);
      if (result.success) {
        clear();
        setCustomerName("");
        setBonusSelections({});
        setPickupMethod("shipment");
        setEventPickupOptionId("");
        setOrderCompleted(true);
        setMessage(`${result.message}（訂單編號：${result.orderNumber}）`);
      } else {
        setMessage(result.message);
      }
    });
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-purple-700">預購購物車</h1>

      {message && (
        <div className="mb-4 flex flex-col gap-3">
          <div className="rounded-2xl bg-purple-50 p-4 text-sm text-purple-700">
            {orderCompleted ? (
              <p>感謝您的訂購，請於期限內完成匯款。{message}</p>
            ) : (
              <p>{message}</p>
            )}
          </div>
          {orderCompleted && <PaymentAccountInfo paymentSettings={paymentSettings} />}
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-zinc-500">
          購物車是空的，先去{" "}
          <Link href="/preorder" className="text-purple-600 underline">
            預購專區
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
                      alt={item.productGroupName}
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
                      {item.productGroupName} - {item.variantName}
                    </p>
                    <p className="text-sm text-pink-600">
                      NT$ {item.unitPrice} × {item.quantity}
                    </p>
                    <p className="text-xs text-zinc-400">小計 NT$ {item.unitPrice * item.quantity}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(e) =>
                      updateQuantity(item.variantId, Math.max(1, Number(e.target.value)))
                    }
                    className="w-16 rounded-lg border border-purple-200 px-2 py-1 text-center"
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
                  <div key={config.groupId} className="rounded-2xl bg-purple-50 p-4">
                    <p className="text-sm font-semibold text-purple-700">
                      {groupInfo.name} 可選保底（每買 {config.thresholdQty} 抽選 {config.pickQty} 個，已選{" "}
                      {selected.length}／{allowed}）
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {config.options.map((opt) => {
                        const isSelected = selected.includes(opt.variantId);
                        const disabled = !isSelected && selected.length >= allowed;
                        return (
                          <button
                            key={opt.variantId}
                            type="button"
                            onClick={() => toggleBonusVariant(config.groupId, opt.variantId, allowed)}
                            disabled={disabled}
                            className={`rounded-full px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${
                              isSelected
                                ? "bg-purple-500 text-white"
                                : "border border-purple-200 bg-white text-purple-600"
                            }`}
                          >
                            {opt.variantName}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {isMixedPickupCart && (
            <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-600">
              賣貨便與活動現場取貨商品需分開結帳，請分開送出訂單。
            </div>
          )}

          {!isMixedPickupCart && eventPickupConfigs.length > 0 && (
            <div className="mt-4 rounded-2xl bg-purple-50 p-4">
              <p className="text-sm font-semibold text-purple-700">取貨方式</p>
              <div className="mt-2 flex flex-col gap-2 text-sm text-zinc-700">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="pickupMethod"
                    checked={pickupMethod === "shipment"}
                    onChange={() => {
                      setPickupMethod("shipment");
                      setEventPickupOptionId("");
                    }}
                  />
                  賣貨便配送
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="pickupMethod"
                    checked={pickupMethod === "event_pickup"}
                    onChange={() => setPickupMethod("event_pickup")}
                  />
                  活動現場取貨
                </label>
                {pickupMethod === "event_pickup" && (
                  <select
                    value={eventPickupOptionId}
                    onChange={(e) => setEventPickupOptionId(e.target.value)}
                    className="rounded-lg border border-purple-200 px-3 py-2"
                  >
                    <option value="">請選擇活動場次</option>
                    {eventPickupConfigs.map((config) => (
                      <optgroup key={config.teacherId} label={config.teacherName}>
                        {config.options.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.displayName}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                )}
              </div>
            </div>
          )}

          {!isLoggedIn ? (
            <div className="mt-6 rounded-2xl bg-purple-50 p-4 text-sm text-purple-700">
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
                className="rounded-lg border border-purple-200 px-3 py-2"
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
                disabled={
                  isPending ||
                  !customerName.trim() ||
                  isMixedPickupCart ||
                  (pickupMethod === "event_pickup" && !eventPickupOptionId)
                }
                className="rounded-full bg-gradient-to-r from-pink-400 to-purple-400 px-6 py-2 font-semibold text-white disabled:opacity-50"
              >
                {isPending ? "送出中..." : "送出預購訂單"}
              </button>
            )}
          </div>
          <p className="mt-2 text-xs text-zinc-400">
            送出後請至會員中心查看訂單狀態並提交匯款資料。
          </p>
        </>
      )}
    </div>
  );
}
