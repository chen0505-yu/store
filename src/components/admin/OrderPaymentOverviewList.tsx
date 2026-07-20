"use client";

import { useMemo, useState } from "react";
import type { AdminShipmentItem } from "@/lib/data/admin-shipment-items";
import { OrderPaymentPanel } from "./OrderPaymentPanel";
import { Pagination } from "./Pagination";

const PAGE_SIZE = 20;

interface OrderGroup {
  orderId: string;
  orderNumber: string;
  customerName: string | null;
  teacherName: string | null;
  createdAt: string;
  items: AdminShipmentItem[];
  totalAmount: number;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 「待確認匯款」／「補款／二補」頁面共用：把已經在伺服器端過濾好的品項依訂單分組顯示，
// 每張訂單直接重用既有的 OrderPaymentPanel（確認匯款／新增補款），不用另外寫一套邏輯。
export function OrderPaymentOverviewList({ items, label = "補款" }: { items: AdminShipmentItem[]; label?: string }) {
  const [page, setPage] = useState(1);

  const groups = useMemo<OrderGroup[]>(() => {
    const map = new Map<string, OrderGroup>();
    for (const item of items) {
      let group = map.get(item.orderId);
      if (!group) {
        group = {
          orderId: item.orderId,
          orderNumber: item.orderNumber,
          customerName: item.customerName,
          teacherName: item.teacherId ? item.teacherName : null,
          createdAt: item.createdAt,
          items: [],
          totalAmount: 0,
        };
        map.set(item.orderId, group);
      }
      group.items.push(item);
      group.totalAmount += item.subtotal;
    }
    return Array.from(map.values()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [items]);

  const pageCount = Math.max(1, Math.ceil(groups.length / PAGE_SIZE));
  const paged = useMemo(() => groups.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [groups, page]);

  return (
    <div className="flex flex-col gap-4">
      {paged.map((g) => (
        <div key={g.orderId} className="flex flex-col gap-2 rounded-3xl bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-mono text-sm font-semibold text-purple-700">
                {g.orderNumber}
                {g.teacherName && (
                  <span className="ml-2 rounded-full bg-pink-100 px-2 py-0.5 text-xs font-semibold text-pink-600">
                    {g.teacherName}
                  </span>
                )}
              </p>
              <p className="mt-1 text-sm text-zinc-600">買家：{g.customerName ?? "-"}</p>
              <p className="text-xs text-zinc-400">建立時間：{formatTime(g.createdAt)}</p>
              <p className="text-xs text-zinc-400">
                {g.items
                  .map((i) => (i.productGroupName && i.variantName ? `${i.productGroupName} - ${i.variantName}` : i.productName))
                  .join("、")}
              </p>
              <p className="text-xs font-semibold text-zinc-500">訂單總金額 NT$ {g.totalAmount}</p>
            </div>
            <OrderPaymentPanel
              orderId={g.orderId}
              orderNumber={g.orderNumber}
              paymentStatus={g.items[0].paymentStatus}
              payment={g.items[0].payment}
              supplements={g.items[0].supplements}
              label={label}
            />
          </div>
        </div>
      ))}
      <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
    </div>
  );
}
