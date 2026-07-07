"use client";

import { useState, useTransition } from "react";
import type { Order } from "@/lib/types";
import { setMarketplaceOrderNumber } from "@/lib/actions/orders";
import { OrderMessages } from "@/components/OrderMessages";

const STATUS_LABEL: Record<string, string> = {
  pending_shipment: "待處理",
  completed: "已完成",
};

export function InstockOrderCard({ order }: { order: Order }) {
  const [value, setValue] = useState(order.marketplaceOrderNumber ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      const result = await setMarketplaceOrderNumber(order.id, value);
      setMessage(result.message);
    });
  }

  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="font-mono text-sm font-semibold text-pink-600">
          {order.orderNumber}
        </span>
        <span className="rounded-full bg-pink-50 px-3 py-1 text-xs font-medium text-pink-500">
          {STATUS_LABEL[order.status] ?? order.status}
        </span>
      </div>

      <ul className="mt-3 flex flex-col gap-1 text-sm text-zinc-600">
        {order.items.map((item, idx) => {
          const displayName =
            item.productGroupName && item.variantName
              ? `${item.productGroupName} - ${item.variantName}`
              : item.productName;
          return (
            <li key={idx} className="flex items-center justify-between gap-2">
              <span>
                {displayName}
                {item.teacherName ? `（${item.teacherName}）` : ""}
                <span className="ml-1 text-xs text-zinc-400">
                  單價 NT$ {item.price} × {item.quantity}
                </span>
              </span>
              <span>小計 NT$ {item.subtotal}</span>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-col gap-1 border-t border-pink-50 pt-2 text-right text-sm text-zinc-600">
        <div className="flex items-center justify-between">
          <span>商品總金額</span>
          <span>NT$ {order.totalAmount}</span>
        </div>
        <div className="flex items-center justify-between font-semibold text-zinc-800">
          <span>訂單總金額</span>
          <span>NT$ {order.totalAmount}</span>
        </div>
      </div>

      {order.bonusSelections && order.bonusSelections.length > 0 && (
        <div className="mt-3 flex flex-col gap-1 rounded-2xl bg-purple-50/60 p-3">
          <p className="text-xs font-semibold text-purple-600">保底/贈品選擇</p>
          {order.bonusSelections.map((b, idx) => (
            <p key={idx} className="text-xs text-zinc-600">
              {b.conditionProductName} → {b.bonusProductName} × {b.quantity}
            </p>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2 rounded-2xl bg-pink-50/60 p-3">
        <p className="text-xs text-zinc-500">
          請先複製上方平台訂單編號「{order.orderNumber}」，到賣貨便便利自填單填入，完成下單後把賣貨便訂單編號填在下方。
        </p>
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
      <OrderMessages orderId={order.id} messages={order.messages} role="customer" />
    </div>
  );
}
