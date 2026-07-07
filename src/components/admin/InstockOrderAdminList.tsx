"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AdminInstockOrder } from "@/lib/data/admin-instock-orders";
import {
  adminSetMarketplaceOrderNumber,
  deleteInstockOrder,
  markInstockOrderCompleted,
} from "@/lib/actions/orders";
import { OrderMessages } from "@/components/OrderMessages";

function OrderRow({ order }: { order: AdminInstockOrder }) {
  const [value, setValue] = useState(order.marketplaceOrderNumber ?? "");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();
  const isCompleted = order.status === "completed";

  function handleSave() {
    startTransition(async () => {
      const result = await adminSetMarketplaceOrderNumber(order.id, value);
      setMessage(result.message);
    });
  }

  function handleMarkCompleted() {
    startTransition(async () => {
      const result = await markInstockOrderCompleted(order.id);
      setMessage(result.message);
      if (result.success) router.refresh();
    });
  }

  function handleDelete() {
    if (!window.confirm("確定要永久刪除此現貨訂單嗎？此動作無法復原。")) return;
    startTransition(async () => {
      const result = await deleteInstockOrder(order.id);
      setMessage(result.message);
      if (result.success) router.refresh();
    });
  }

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono font-semibold text-pink-600">{order.orderNumber}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400">買家：{order.customerName ?? "-"}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              isCompleted ? "bg-green-100 text-green-700" : "bg-pink-50 text-pink-500"
            }`}
          >
            {isCompleted ? "已完成" : "待處理"}
          </span>
        </div>
      </div>
      <ul className="mt-2 flex flex-col gap-1 text-xs text-zinc-500">
        {order.items.map((item, idx) => {
          const displayName =
            item.productGroupName && item.variantName
              ? `${item.productGroupName} - ${item.variantName}`
              : item.productName;
          return (
            <li key={idx} className="flex items-center justify-between gap-2">
              <span>
                {displayName}
                {item.teacherName && <span className="text-purple-400">（{item.teacherName}）</span>}
                <span className="ml-1 text-zinc-400">
                  單價 NT$ {item.price} × {item.quantity}
                </span>
              </span>
              <span>小計 NT$ {item.subtotal}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-1 border-t border-zinc-100 pt-1 text-right text-xs font-semibold text-zinc-600">
        訂單總金額 NT$ {order.totalAmount}
      </p>
      {order.bonusSelections.length > 0 && (
        <div className="mt-2 flex flex-col gap-1 rounded-xl bg-purple-50/60 p-2">
          <p className="text-xs font-semibold text-purple-600">保底/贈品選擇</p>
          {order.bonusSelections.map((b, idx) => (
            <p key={idx} className="text-xs text-zinc-600">
              {b.conditionProductName} → {b.bonusProductName} × {b.quantity}
            </p>
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center gap-2">
        <label className="text-xs text-zinc-500">賣貨便訂單編號</label>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="尚未填寫"
          className="flex-1 rounded-lg border border-pink-200 px-2 py-1 text-sm"
        />
        <button
          onClick={handleSave}
          disabled={isPending}
          className="rounded-full bg-pink-500 px-3 py-1 text-xs text-white disabled:opacity-50"
        >
          {isPending ? "儲存中..." : "儲存"}
        </button>
      </div>
      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          onClick={() => router.push(`/print/instock?order=${order.id}`)}
          className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-600"
        >
          列印
        </button>
        {!isCompleted && (
          <button
            onClick={handleMarkCompleted}
            disabled={isPending}
            className="rounded-full bg-purple-500 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
          >
            標記已完成
          </button>
        )}
        <button
          onClick={handleDelete}
          disabled={isPending}
          className="rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
        >
          永久刪除訂單
        </button>
      </div>
      {message && <p className="mt-1 text-right text-xs text-pink-600">{message}</p>}
      <OrderMessages orderId={order.id} messages={order.messages} role="admin" />
    </div>
  );
}

export function InstockOrderAdminList({ orders }: { orders: AdminInstockOrder[] }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const router = useRouter();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) => {
      return (
        o.orderNumber.toLowerCase().includes(q) ||
        (o.customerName ?? "").toLowerCase().includes(q) ||
        (o.marketplaceOrderNumber ?? "").toLowerCase().includes(q) ||
        o.items.some((it) => it.productName.toLowerCase().includes(q))
      );
    });
  }, [orders, search]);

  function toggleSelected(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function handleBatchPrint() {
    if (selected.length === 0) return;
    router.push(`/print/instock?order=${selected.join(",")}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜尋平台訂單編號／買家名稱／賣貨便訂單編號／商品名稱"
          className="flex-1 rounded-full border border-pink-200 px-4 py-2 text-sm"
        />
        <button
          onClick={handleBatchPrint}
          disabled={selected.length === 0}
          className="rounded-full bg-pink-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          批量列印（已選 {selected.length}）
        </button>
      </div>
      <div className="flex flex-col gap-3">
        {filtered.map((order) => (
          <div key={order.id} className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={selected.includes(order.id)}
              onChange={() => toggleSelected(order.id)}
              className="mt-5 h-4 w-4"
            />
            <div className="flex-1">
              <OrderRow order={order} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
