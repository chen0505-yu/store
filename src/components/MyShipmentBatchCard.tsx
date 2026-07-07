"use client";

import { useState, useTransition } from "react";
import type { MyShipmentOrder } from "@/lib/data/my-shipments";
import { setShipmentMarketplaceOrderNumber } from "@/lib/actions/shipments";
import { getDisplayShipmentStatusLabel } from "@/lib/shipment-status";

function formatTime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function MyShipmentBatchCard({ batch }: { batch: MyShipmentOrder }) {
  const [value, setValue] = useState(batch.marketplaceOrderNumber ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isEventPickup = batch.pickupMethod === "event_pickup";
  const canFillMarketplaceNumber =
    !isEventPickup && (batch.status === "listed" || batch.status === "completed");
  // 一筆訂單可能同時有後台手動新增的二補、跟商品到貨自動帶入的二補，兩者都算「待補款」，
  // 要加總顯示給買家，不能只挑其中一筆，不然買家會少補錢。
  const pendingSupplements = batch.supplements.filter((s) => s.status === "pending");
  const pendingTotal = pendingSupplements.reduce((sum, s) => sum + s.amount, 0);
  const pendingReasons = pendingSupplements.map((s) => s.reason).filter((r): r is string => Boolean(r));

  function handleSave() {
    startTransition(async () => {
      const result = await setShipmentMarketplaceOrderNumber(batch.id, value);
      setMessage(result.message);
    });
  }

  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs text-zinc-400">出貨訂單編號</p>
          <p className="font-mono text-sm font-semibold text-purple-600">{batch.shipmentNumber}</p>
          <p className="mt-1 text-xs text-zinc-400">
            平台訂單編號：{batch.orderNumbers.join("、")}
          </p>
          {batch.pickupMethod && (
            <p className="mt-1 text-xs text-purple-500">
              取貨方式：
              {isEventPickup
                ? `活動現場取貨（${batch.eventPickupDisplayName ?? "-"}）`
                : "賣貨便配送"}
            </p>
          )}
        </div>
        <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-medium text-purple-500">
          {getDisplayShipmentStatusLabel(batch.status, batch.pickupMethod)}
        </span>
      </div>

      <ul className="mt-3 flex flex-col gap-1 text-sm text-zinc-600">
        {batch.items.map((item, idx) => (
          <li key={idx} className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between gap-2">
              <span>
                {item.productName} × {item.quantity}
                {item.teacherName ? `（${item.teacherName}）` : ""}
              </span>
              <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs text-purple-500">
                {getDisplayShipmentStatusLabel(item.status, batch.pickupMethod)}
              </span>
            </div>
            {item.surchargeAmount !== null && item.surchargeAmount > 0 && (
              <p className="text-right text-xs text-pink-500">
                二補 NT$ {item.surchargeAmount} × {item.quantity}　小計 NT$ {item.surchargeSubtotal}
              </p>
            )}
          </li>
        ))}
      </ul>

      <p className="mt-2 text-xs text-zinc-400">建立時間：{formatTime(batch.createdAt)}</p>

      {batch.bonusSelections.length > 0 && (
        <div className="mt-3 flex flex-col gap-1 rounded-2xl bg-purple-50/60 p-3">
          <p className="text-xs font-semibold text-purple-600">保底/贈品選擇</p>
          {batch.bonusSelections.map((b, idx) => (
            <p key={idx} className="text-xs text-zinc-600">
              {b.conditionProductName} → {b.bonusProductName} × {b.quantity}
            </p>
          ))}
        </div>
      )}

      {pendingTotal > 0 && isEventPickup && (
        <div className="mt-4 rounded-2xl bg-pink-50/60 p-3">
          <p className="text-sm font-semibold text-pink-600">
            您本次需要補款 NT$ {pendingTotal}
            {pendingReasons.length > 0 ? `（${pendingReasons.join("、")}）` : ""}，請於現場取貨時補齊。
          </p>
        </div>
      )}

      {canFillMarketplaceNumber && (
        <div className="mt-4 flex flex-col gap-2 rounded-2xl bg-pink-50/60 p-3">
          <p className="text-xs text-zinc-500">
            商品已開賣貨便，請到賣貨便完成下單後，把賣貨便訂單編號填在下方，方便核對出貨。
          </p>
          {pendingTotal > 0 && (
            <p className="text-sm font-semibold text-pink-600">
              您本次需要補款 NT$ {pendingTotal}
              {pendingReasons.length > 0 ? `（${pendingReasons.join("、")}）` : ""}，請在賣貨便下單時填入此金額。
            </p>
          )}
          <div className="flex gap-2">
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="賣貨便訂單編號"
              className="flex-1 rounded-lg border border-pink-200 px-3 py-2 text-sm"
            />
            <button
              onClick={handleSave}
              disabled={isPending || !value.trim()}
              className="rounded-full bg-pink-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {isPending ? "儲存中..." : "儲存"}
            </button>
          </div>
          {message && <p className="text-xs text-pink-600">{message}</p>}
        </div>
      )}
    </div>
  );
}
