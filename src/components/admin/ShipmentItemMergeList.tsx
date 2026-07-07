"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AdminShipmentItem } from "@/lib/data/admin-shipment-items";
import type { OrderType } from "@/lib/types";
import { mergeShipmentItems, mergeShipmentItemsBatch, type BatchMergeResult } from "@/lib/actions/shipments";
import { deletePreorderOrder } from "@/lib/actions/orders";
import { MERGEABLE_SHIPMENT_STATUSES, getDisplayShipmentStatusLabel } from "@/lib/shipment-status";
import { OrderPaymentPanel } from "./OrderPaymentPanel";
import { OrderMessages } from "@/components/OrderMessages";
import { Collapsible } from "./Collapsible";
import { Pagination } from "./Pagination";
import { ProgressStepper } from "@/components/ProgressStepper";
import {
  PRODUCT_PROGRESS_STEPS,
  PREORDER_ORDER_PROGRESS_STEPS,
  getOrderItemProgressIndex,
  getPreorderOrderProgressIndex,
} from "@/lib/progress";

const PAGE_SIZE = 20;

type PickupFilterKey = "all" | "shipment" | "event_pickup";

const PICKUP_FILTER_OPTIONS: { key: PickupFilterKey; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "shipment", label: "賣貨便" },
  { key: "event_pickup", label: "面交／活動取貨" },
];

// 賣貨便跟面交／活動取貨的商品完全分流：這裡把「沒有選現場取貨」一律視為賣貨便，
// 跟 mergeShipmentItems 的判斷邏輯保持一致。
function itemPickupMethod(item: AdminShipmentItem): "shipment" | "event_pickup" {
  return item.pickupMethod === "event_pickup" ? "event_pickup" : "shipment";
}

interface BuyerGroup {
  buyerId: string;
  customerName: string | null;
  orderNumbers: string[];
  orders: Map<string, AdminShipmentItem[]>;
  allItems: AdminShipmentItem[];
}

export function ShipmentItemMergeList({
  items,
  orderType,
}: {
  items: AdminShipmentItem[];
  orderType: OrderType;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedBuyers, setSelectedBuyers] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [batchResult, setBatchResult] = useState<BatchMergeResult | null>(null);
  const [search, setSearch] = useState("");
  const [pickupFilter, setPickupFilter] = useState<PickupFilterKey>("all");
  const [page, setPage] = useState(1);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function toggleBuyer(buyerId: string) {
    setSelectedBuyers((prev) =>
      prev.includes(buyerId) ? prev.filter((id) => id !== buyerId) : [...prev, buyerId]
    );
  }

  function toggle(id: string, disabled: boolean) {
    if (disabled) return;
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function handleMerge(ids: string[]) {
    if (ids.length === 0) return;
    startTransition(async () => {
      const result = await mergeShipmentItems(ids, orderType);
      if (result.success && result.shipmentId) {
        setSelected([]);
        router.push(`/print?shipment=${result.shipmentId}`);
      } else {
        setMessage(result.message);
      }
    });
  }

  function handleDeleteOrder(orderId: string) {
    if (!window.confirm("確定要永久刪除此訂單嗎？此動作無法復原。")) return;
    startTransition(async () => {
      const result = await deletePreorderOrder(orderId);
      setMessage(result.message);
      if (result.success) router.refresh();
    });
  }

  // 一筆出貨訂單只能屬於一位買家，手動勾選（而非「合併此買家已到貨商品」按鈕）
  // 有可能不小心跨買家勾選，這裡先在前端擋掉，伺服器端 mergeShipmentItems 也會再擋一次。
  const selectedBuyerIds = useMemo(() => {
    const map = new Map(items.map((item) => [item.id, item.buyerId]));
    return new Set(selected.map((id) => map.get(id)).filter((id): id is string => Boolean(id)));
  }, [items, selected]);
  const hasCrossBuyerSelection = selectedBuyerIds.size > 1;

  // 同樣道理：賣貨便跟面交／活動取貨不可合併在同一張出貨訂單，勾選時先在前端擋掉。
  const selectedPickupMethods = useMemo(() => {
    const map = new Map(items.map((item) => [item.id, itemPickupMethod(item)]));
    return new Set(selected.map((id) => map.get(id)).filter((v): v is "shipment" | "event_pickup" => Boolean(v)));
  }, [items, selected]);
  const hasCrossPickupSelection = selectedPickupMethods.size > 1;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((item) => pickupFilter === "all" || itemPickupMethod(item) === pickupFilter)
      .filter((item) => {
        if (!q) return true;
        return (
          item.orderNumber.toLowerCase().includes(q) ||
          (item.customerName ?? "").toLowerCase().includes(q) ||
          (item.teacherName ?? "").toLowerCase().includes(q) ||
          item.productName.toLowerCase().includes(q) ||
          (item.shipmentMarketplaceOrderNumber ?? "").toLowerCase().includes(q)
        );
      });
  }, [items, search, pickupFilter]);

  // 先依買家分組，同一買家的多筆訂單放在一起顯示、可以一次合併列印；
  // 買家底下再依訂單分組，因為匯款/補款/留言都是綁在單一訂單上。
  const buyerGroups = useMemo<BuyerGroup[]>(() => {
    const map = new Map<string, BuyerGroup>();
    for (const item of filtered) {
      let group = map.get(item.buyerId);
      if (!group) {
        group = {
          buyerId: item.buyerId,
          customerName: item.customerName,
          orderNumbers: [],
          orders: new Map(),
          allItems: [],
        };
        map.set(item.buyerId, group);
      }
      if (!group.orderNumbers.includes(item.orderNumber)) {
        group.orderNumbers.push(item.orderNumber);
      }
      const orderItems = group.orders.get(item.orderId) ?? [];
      orderItems.push(item);
      group.orders.set(item.orderId, orderItems);
      group.allItems.push(item);
    }
    return Array.from(map.values());
  }, [filtered]);

  const pageCount = Math.max(1, Math.ceil(buyerGroups.length / PAGE_SIZE));
  const pagedGroups = useMemo(
    () => buyerGroups.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [buyerGroups, page]
  );

  function handleBatchMerge() {
    if (selectedBuyers.length === 0) return;
    const groups = buyerGroups
      .filter((g) => selectedBuyers.includes(g.buyerId))
      .map((g) => ({ customerName: g.customerName, itemIds: g.allItems.map((i) => i.id) }));
    startTransition(async () => {
      const result = await mergeShipmentItemsBatch(groups);
      setBatchResult(result);
      if (result.success) {
        setSelectedBuyers([]);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {message && (
        <div className="rounded-2xl bg-red-50 p-3 text-sm text-red-600">{message}</div>
      )}

      {batchResult && (
        <div className="flex flex-col gap-1 rounded-2xl bg-purple-50/60 p-3 text-sm">
          <p className="font-semibold text-purple-700">{batchResult.message}</p>
          {batchResult.skipped.length > 0 && (
            <ul className="flex flex-col gap-0.5 text-xs text-zinc-500">
              {batchResult.skipped.map((s, idx) => (
                <li key={idx}>
                  {s.customerName ?? "-"}：{s.reason}
                </li>
              ))}
            </ul>
          )}
          <button
            onClick={() => setBatchResult(null)}
            className="self-start text-xs text-purple-500 underline"
          >
            關閉
          </button>
        </div>
      )}

      <input
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
        placeholder="搜尋訂單編號／買家名稱／老師名稱／商品名稱／賣貨便訂單編號"
        className="rounded-full border border-purple-200 px-4 py-2 text-sm"
      />

      <div className="flex flex-wrap items-center gap-2">
        {PICKUP_FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => {
              setPickupFilter(opt.key);
              setPage(1);
            }}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              pickupFilter === opt.key ? "bg-purple-500 text-white" : "bg-purple-50 text-purple-600"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">
          已選擇 {selected.length} 件商品
          {orderType === "preorder" && "（只能選擇已到台、整理中或已開賣貨便、尚未合併的商品）"}
          {hasCrossBuyerSelection && (
            <span className="ml-2 text-red-500">選取的商品跨了不同買家，請重新勾選</span>
          )}
          {hasCrossPickupSelection && (
            <span className="ml-2 text-red-500">
              賣貨便與面交／活動取貨商品不可合併在同一張出貨訂單，請重新勾選
            </span>
          )}
        </p>
        <button
          onClick={() => handleMerge(selected)}
          disabled={selected.length === 0 || isPending || hasCrossBuyerSelection || hasCrossPickupSelection}
          className="rounded-full bg-gradient-to-r from-pink-400 to-purple-400 px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {isPending ? "處理中..." : "建立出貨訂單並列印"}
        </button>
      </div>

      {orderType === "preorder" && (
        <div className="flex items-center justify-between rounded-2xl bg-purple-50/40 p-3">
          <p className="text-sm text-zinc-500">
            已勾選 {selectedBuyers.length} 位買家
            <span className="ml-1 text-xs text-zinc-400">
              （只會合併賣貨便、已確認匯款、尚未合併的商品，其餘自動略過）
            </span>
          </p>
          <button
            onClick={handleBatchMerge}
            disabled={selectedBuyers.length === 0 || isPending}
            className="rounded-full bg-purple-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {isPending ? "處理中..." : "批量合併賣貨便"}
          </button>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {pagedGroups.map((group) => {
          const eligibleItems = group.allItems.filter(
            (i) => MERGEABLE_SHIPMENT_STATUSES.includes(i.status) && !i.shipmentId
          );
          // 快速合併按鈕依取貨方式（賣貨便／面交＋活動場次）分開，避免一鍵把不同取貨方式的商品混進同一張出貨訂單。
          const eligibleGroups = new Map<string, { label: string; ids: string[] }>();
          for (const item of eligibleItems) {
            const method = itemPickupMethod(item);
            const key = method === "shipment" ? "shipment" : `event_pickup::${item.eventPickupDisplayName ?? ""}`;
            const label = method === "shipment" ? "賣貨便" : `面交：${item.eventPickupDisplayName ?? "-"}`;
            const entry = eligibleGroups.get(key) ?? { label, ids: [] };
            entry.ids.push(item.id);
            eligibleGroups.set(key, entry);
          }
          return (
            <div key={group.buyerId} className="flex flex-col gap-3 rounded-3xl bg-purple-50/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-start gap-2">
                  {orderType === "preorder" && (
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selectedBuyers.includes(group.buyerId)}
                      onChange={() => toggleBuyer(group.buyerId)}
                    />
                  )}
                  <div>
                    <p className="text-sm font-semibold text-purple-700">
                      買家：{group.customerName ?? "-"}
                    </p>
                    <p className="text-xs text-zinc-400">
                      平台訂單編號：{group.orderNumbers.join("、")}
                    </p>
                  </div>
                </div>
                {orderType === "preorder" && eligibleGroups.size > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    {Array.from(eligibleGroups.entries()).map(([key, entry]) => (
                      <button
                        key={key}
                        onClick={() => handleMerge(entry.ids)}
                        disabled={isPending}
                        className="rounded-full bg-purple-500 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
                      >
                        合併{entry.label}（{entry.ids.length}）
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3">
                {Array.from(group.orders.entries()).map(([orderId, orderItems]) => (
                  <Collapsible
                    key={orderId}
                    summary={
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="font-mono font-semibold text-purple-600">
                            {orderItems[0].orderNumber}
                          </span>
                          <span className="ml-2 text-xs text-zinc-400">
                            {orderItems.length} 件商品　訂單總金額 NT${" "}
                            {orderItems.reduce((sum, i) => sum + i.subtotal, 0)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          {orderType === "preorder" && (
                            <OrderPaymentPanel
                              orderId={orderId}
                              paymentStatus={orderItems[0].paymentStatus}
                              payment={orderItems[0].payment}
                              supplements={orderItems[0].supplements}
                            />
                          )}
                          <button
                            onClick={() => handleDeleteOrder(orderId)}
                            disabled={isPending}
                            className="rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-40"
                          >
                            永久刪除訂單
                          </button>
                        </div>
                      </div>
                    }
                  >
                    {orderType === "preorder" && (
                      <div className="mb-2 rounded-2xl bg-purple-50/50 p-3">
                        <ProgressStepper
                          steps={PREORDER_ORDER_PROGRESS_STEPS}
                          currentIndex={getPreorderOrderProgressIndex({
                            paymentConfirmed: orderItems[0].paymentStatus === "confirmed",
                            allItemsMerged: orderItems.every((i) => i.merged),
                            mergedShipmentsListedOrBeyond:
                              orderItems.length > 0 &&
                              orderItems.every(
                                (i) => i.merged && (i.status === "listed" || i.status === "completed")
                              ),
                          })}
                          size="sm"
                        />
                      </div>
                    )}
                    <div className="flex flex-col gap-2">
                      {orderItems.map((item) => {
                        const disabled = !MERGEABLE_SHIPMENT_STATUSES.includes(item.status) || Boolean(item.shipmentId);
                        const displayName =
                          item.productGroupName && item.variantName
                            ? `${item.productGroupName} - ${item.variantName}`
                            : item.productName;
                        return (
                          <div
                            key={item.id}
                            className="flex items-center gap-3 border-t border-zinc-100 pt-2 text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={selected.includes(item.id)}
                              disabled={disabled}
                              onChange={() => toggle(item.id, disabled)}
                            />
                            <div className="flex-1">
                              <p>
                                {displayName}
                                {item.teacherName && (
                                  <span className="text-purple-400"> （{item.teacherName}）</span>
                                )}
                              </p>
                              <p className="text-xs text-zinc-400">
                                單價 NT$ {item.price} × {item.quantity}　小計 NT$ {item.subtotal}
                              </p>
                              {item.shipmentMarketplaceOrderNumber && (
                                <p className="text-xs text-pink-500">
                                  賣貨便訂單編號：{item.shipmentMarketplaceOrderNumber}
                                </p>
                              )}
                              {orderType === "preorder" && (
                                <div className="mt-1.5 max-w-xs">
                                  <ProgressStepper
                                    steps={PRODUCT_PROGRESS_STEPS}
                                    currentIndex={getOrderItemProgressIndex(item.arrivalStatus, item.merged)}
                                    size="sm"
                                  />
                                </div>
                              )}
                            </div>
                            <span
                              className={`rounded-full px-2 py-1 text-xs ${
                                item.status === "arrived"
                                  ? "bg-green-100 text-green-700"
                                  : item.status === "not_arrived"
                                    ? "bg-orange-100 text-orange-700"
                                    : "bg-purple-100 text-purple-700"
                              }`}
                            >
                              {getDisplayShipmentStatusLabel(item.status, item.pickupMethod)}
                            </span>
                            {item.shipmentId ? (
                              <button
                                onClick={() => router.push(`/print?shipment=${item.shipmentId}`)}
                                className="text-xs text-purple-500 underline"
                              >
                                列印
                              </button>
                            ) : (
                              !disabled && (
                                <button
                                  onClick={() => handleMerge([item.id])}
                                  className="text-xs text-purple-500 underline"
                                >
                                  單獨列印
                                </button>
                              )
                            )}
                          </div>
                        );
                      })}
                      <p className="border-t border-zinc-100 pt-2 text-right text-sm font-semibold text-zinc-700">
                        訂單總金額 NT$ {orderItems.reduce((sum, i) => sum + i.subtotal, 0)}
                      </p>
                    </div>
                    {orderItems[0].pickupMethod && (
                      <p className="mt-2 text-xs font-semibold text-purple-600">
                        取貨方式：
                        {orderItems[0].pickupMethod === "event_pickup"
                          ? `活動現場取貨（${orderItems[0].eventPickupDisplayName ?? "-"}）`
                          : "賣貨便配送"}
                      </p>
                    )}
                    {orderItems[0].bonusSelections.length > 0 && (
                      <div className="mt-2 flex flex-col gap-1 rounded-xl bg-purple-50/60 p-2">
                        <p className="text-xs font-semibold text-purple-600">客戶選擇的保底/贈品</p>
                        {orderItems[0].bonusSelections.map((b, idx) => (
                          <p key={idx} className="text-xs text-zinc-600">
                            {b.conditionProductName} → {b.bonusProductName} × {b.quantity}
                          </p>
                        ))}
                      </div>
                    )}
                    <OrderMessages orderId={orderId} messages={orderItems[0].messages} role="admin" />
                  </Collapsible>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
    </div>
  );
}
