"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AdminShipment } from "@/lib/data/shipments";
import { advanceShipmentStatus, deleteShipmentOrder, markShipmentsPrinted } from "@/lib/actions/shipments";
import { getDisplayShipmentStatusLabel } from "@/lib/shipment-status";
import { OrderPaymentPanel } from "./OrderPaymentPanel";
import { ProgressStepper } from "@/components/ProgressStepper";
import { getShipmentProgressSteps, getShipmentProgressIndex } from "@/lib/progress";

function formatTime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ShipmentRow({ shipment }: { shipment: AdminShipment }) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const isFinal = shipment.status === "completed";
  // 賣貨便出貨單一定要先填賣貨便訂單編號才能列印；活動現場取貨／面交不需要賣貨便編號。
  const canPrint = shipment.pickupMethod === "event_pickup" || Boolean(shipment.marketplaceOrderNumber);

  function handlePrint() {
    startTransition(async () => {
      await markShipmentsPrinted([shipment.id]);
      router.push(`/print?shipment=${shipment.id}`);
    });
  }

  function handleDelete() {
    if (isFinal) {
      setMessage("此出貨訂單已完成，無法刪除。");
      return;
    }
    if (!window.confirm("確定要刪除此出貨訂單嗎？商品會回到可重新合併的狀態，此動作無法復原。")) return;
    startTransition(async () => {
      const result = await deleteShipmentOrder(shipment.id);
      setMessage(result.message);
      if (result.success) router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-mono text-sm font-semibold text-purple-700">{shipment.shipmentNumber}</p>
          <p className="mt-1 text-sm text-zinc-600">買家：{shipment.customerName ?? "-"}</p>
          <p className="text-xs text-zinc-400">
            平台訂單編號：{shipment.orderNumbers.join("、") || "-"}
          </p>
          <p className="text-xs text-zinc-400">建立時間：{formatTime(shipment.createdAt)}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="rounded-full bg-purple-100 px-2 py-1 text-xs text-purple-700">
            {shipment.shipmentType === "preorder" ? "預購" : "現貨"} ·{" "}
            {getDisplayShipmentStatusLabel(shipment.status, shipment.pickupMethod)}
          </span>
          {shipment.printedAt && (
            <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-500">
              已列印
            </span>
          )}
          {shipment.marketplaceOrderNumber && (
            <span className="text-xs text-pink-500">
              賣貨便訂單編號：{shipment.marketplaceOrderNumber}
            </span>
          )}
          {shipment.pickupMethod && (
            <span className="text-xs text-purple-500">
              取貨方式：
              {shipment.pickupMethod === "event_pickup"
                ? `活動現場取貨（${shipment.eventPickupDisplayName ?? "-"}）`
                : "賣貨便配送"}
            </span>
          )}
        </div>
      </div>

      <div className="rounded-2xl bg-purple-50/50 p-3">
        <ProgressStepper
          steps={getShipmentProgressSteps(shipment.pickupMethod)}
          currentIndex={getShipmentProgressIndex({
            status: shipment.status,
            pickupMethod: shipment.pickupMethod,
            marketplaceOrderNumber: shipment.marketplaceOrderNumber,
          })}
          size="sm"
        />
      </div>

      <div className="flex flex-col gap-1 border-t border-zinc-100 pt-2 text-sm text-zinc-600">
        {shipment.items.map((item, idx) => {
          const displayName =
            item.productGroupName && item.variantName
              ? `${item.productGroupName} - ${item.variantName}`
              : item.productName;
          return (
            <div key={idx} className="flex items-center justify-between gap-2">
              <span>
                {displayName}
                {item.teacherName ? `（${item.teacherName}）` : ""}
                <span className="ml-1 text-xs text-zinc-400">
                  單價 NT$ {item.price} × {item.quantity}
                </span>
              </span>
              <span className="flex flex-col items-end gap-0.5">
                <span className="flex items-center gap-2">
                  <span className="text-xs">小計 NT$ {item.subtotal}</span>
                  <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs text-purple-500">
                    {getDisplayShipmentStatusLabel(item.status, shipment.pickupMethod)}
                  </span>
                </span>
                {item.surchargeAmount !== null && item.surchargeAmount > 0 && (
                  <span className="text-xs text-pink-500">
                    二補 NT$ {item.surchargeAmount} × {item.quantity}　小計 NT$ {item.surchargeSubtotal}
                  </span>
                )}
              </span>
            </div>
          );
        })}
        <div className="mt-1 flex items-center justify-between text-xs font-semibold text-zinc-500">
          <span>總件數：{shipment.totalQuantity}</span>
          <span>總金額 NT$ {shipment.totalAmount}</span>
        </div>
      </div>

      {shipment.orders.some((o) => o.bonusSelections.length > 0) && (
        <div className="flex flex-col gap-2 rounded-xl bg-purple-50/60 p-3">
          <p className="text-xs font-semibold text-purple-600">客戶選擇的保底/贈品</p>
          {shipment.orders
            .filter((o) => o.bonusSelections.length > 0)
            .map((order) => (
              <div key={order.id} className="flex flex-col gap-1">
                <p className="font-mono text-xs text-purple-400">{order.orderNumber}</p>
                {order.bonusSelections.map((b, idx) => (
                  <p key={idx} className="text-xs text-zinc-600">
                    {b.conditionProductName} → {b.bonusProductName} × {b.quantity}
                  </p>
                ))}
              </div>
            ))}
        </div>
      )}

      {shipment.orders.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-zinc-100 pt-2">
          <p className="text-xs font-semibold text-pink-600">
            二補（到貨後補差額，設定後買家會在「我的出貨訂單」看到需補金額）
          </p>
          {shipment.orders.map((order) => {
            const activeSupplementTotal = order.supplements
              .filter((s) => s.status !== "cancelled" && s.status !== "not_needed")
              .reduce((sum, s) => sum + s.amount, 0);
            return (
              <div key={order.id} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span className="font-mono text-xs text-zinc-400">{order.orderNumber}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      activeSupplementTotal > 0 ? "bg-pink-100 text-pink-600" : "bg-zinc-100 text-zinc-400"
                    }`}
                  >
                    此買家二補總額 NT$ {activeSupplementTotal}
                  </span>
                </span>
                <OrderPaymentPanel
                  orderId={order.id}
                  orderNumber={order.orderNumber}
                  paymentStatus={order.paymentStatus}
                  payment={order.payment}
                  supplements={order.supplements}
                  label="二補"
                />
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        {!canPrint && (
          <span className="text-xs text-red-500">尚未填寫賣貨便訂單編號，無法列印</span>
        )}
        <button
          onClick={handlePrint}
          disabled={!canPrint || isPending}
          className="text-xs text-purple-500 underline disabled:cursor-not-allowed disabled:text-zinc-300 disabled:no-underline"
        >
          列印
        </button>
        <button
          onClick={() =>
            startTransition(async () => {
              await advanceShipmentStatus(shipment.id);
            })
          }
          disabled={isFinal || isPending}
          className="rounded-full bg-purple-500 px-3 py-1 text-xs text-white disabled:opacity-40"
        >
          {isFinal ? "已完成" : "推進下一階段"}
        </button>
        <button
          onClick={handleDelete}
          disabled={isPending || isFinal}
          className="rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-40"
        >
          刪除出貨訂單
        </button>
      </div>
      {message && <p className="text-right text-xs text-red-500">{message}</p>}
    </div>
  );
}
