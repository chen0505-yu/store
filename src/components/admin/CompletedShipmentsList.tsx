"use client";

import { useMemo, useState, useTransition } from "react";
import type { AdminShipment } from "@/lib/data/shipments";
import { markShipmentsExported, deleteCompletedShipments } from "@/lib/actions/completed-shipments";
import { getDisplayShipmentStatusLabel } from "@/lib/shipment-status";
import { Pagination } from "./Pagination";

const PAGE_SIZE = 20;
const DELETE_CONFIRM_PHRASE = "永久刪除";

type PickupFilterKey = "all" | "shipment" | "event_pickup";

function sellerName(s: AdminShipment): string {
  return s.shipmentType === "artist" ? s.items[0]?.teacherName ?? "-" : "葴葴";
}

export function CompletedShipmentsList({
  shipments,
  showSellerFilter,
}: {
  shipments: AdminShipment[];
  showSellerFilter: boolean;
}) {
  const [search, setSearch] = useState("");
  const [sellerFilter, setSellerFilter] = useState("");
  const [pickupFilter, setPickupFilter] = useState<PickupFilterKey>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();

  const sellers = useMemo(
    () => Array.from(new Set(shipments.map((s) => sellerName(s)))).sort((a, b) => a.localeCompare(b, "zh-Hant")),
    [shipments]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return shipments.filter((s) => {
      if (pickupFilter !== "all" && (s.pickupMethod ?? "shipment") !== pickupFilter) return false;
      if (sellerFilter && sellerName(s) !== sellerFilter) return false;
      if (dateFrom && s.completedAt && s.completedAt < dateFrom) return false;
      if (dateTo && s.completedAt && s.completedAt > `${dateTo}T23:59:59`) return false;
      if (!q) return true;
      return (
        s.shipmentNumber.toLowerCase().includes(q) ||
        (s.customerName ?? "").toLowerCase().includes(q) ||
        s.orderNumbers.some((n) => n.toLowerCase().includes(q))
      );
    });
  }, [shipments, search, pickupFilter, sellerFilter, dateFrom, dateTo]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleAll() {
    const allIds = filtered.map((s) => s.id);
    setSelected((prev) => (allIds.every((id) => prev.includes(id)) ? [] : allIds));
  }

  const selectedShipments = shipments.filter((s) => selected.includes(s.id));
  const allSelectedExported = selectedShipments.length > 0 && selectedShipments.every((s) => Boolean(s.exportBatchId));

  function handleExport() {
    if (selected.length === 0) return;
    startTransition(async () => {
      const result = await markShipmentsExported(selected);
      setMessage(result.message);
      if (result.success) {
        window.open(`/api/admin/completed-shipments-export?ids=${selected.join(",")}`, "_blank");
      }
    });
  }

  function handleDelete() {
    if (confirmText !== DELETE_CONFIRM_PHRASE) return;
    startTransition(async () => {
      const result = await deleteCompletedShipments(selected);
      setMessage(result.message);
      if (result.success) {
        setSelected([]);
        setShowDeleteConfirm(false);
        setConfirmText("");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {message && <div className="rounded-2xl bg-purple-50 p-3 text-sm text-purple-700">{message}</div>}

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="搜尋出貨訂單編號／買家／平台訂單編號"
          className="flex-1 rounded-full border border-purple-200 px-4 py-2 text-sm"
        />
        {showSellerFilter && (
          <select
            value={sellerFilter}
            onChange={(e) => {
              setSellerFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-full border border-purple-200 px-3 py-2 text-sm"
          >
            <option value="">全部繪師／葴葴</option>
            {sellers.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        )}
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => {
            setDateFrom(e.target.value);
            setPage(1);
          }}
          className="rounded-full border border-purple-200 px-3 py-2 text-sm"
        />
        <span className="text-xs text-zinc-400">～</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => {
            setDateTo(e.target.value);
            setPage(1);
          }}
          className="rounded-full border border-purple-200 px-3 py-2 text-sm"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["all", "shipment", "event_pickup"] as PickupFilterKey[]).map((key) => (
          <button
            key={key}
            onClick={() => {
              setPickupFilter(key);
              setPage(1);
            }}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              pickupFilter === key ? "bg-purple-500 text-white" : "bg-purple-50 text-purple-600"
            }`}
          >
            {key === "all" ? "全部" : key === "shipment" ? "賣貨便" : "面交／活動取貨"}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-purple-50/40 p-3">
        <div className="flex items-center gap-2 text-sm text-zinc-600">
          <input
            type="checkbox"
            checked={filtered.length > 0 && filtered.every((s) => selected.includes(s.id))}
            onChange={toggleAll}
          />
          <span>已選擇 {selected.length} 筆</span>
          {selected.length > 0 && !allSelectedExported && (
            <span className="text-xs text-zinc-400">（尚未全部匯出過，匯出後才能永久刪除）</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={selected.length === 0 || isPending}
            className="rounded-full bg-purple-500 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
          >
            {isPending ? "處理中..." : "匯出 Excel"}
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            disabled={selected.length === 0 || !allSelectedExported || isPending}
            className="rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
          >
            批量永久刪除
          </button>
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="flex flex-col gap-2 rounded-2xl bg-red-50 p-4 text-sm text-red-700">
          <p className="font-semibold">
            即將永久刪除 {selected.length} 筆出貨訂單（含底下的平台訂單、匯款、補款紀錄），此動作無法復原。
          </p>
          <p className="text-xs">請輸入「{DELETE_CONFIRM_PHRASE}」以確認：</p>
          <div className="flex items-center gap-2">
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={DELETE_CONFIRM_PHRASE}
              className="rounded-lg border border-red-300 px-3 py-2 text-sm"
            />
            <button
              onClick={handleDelete}
              disabled={confirmText !== DELETE_CONFIRM_PHRASE || isPending}
              className="rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
            >
              {isPending ? "刪除中..." : "確認永久刪除"}
            </button>
            <button
              onClick={() => {
                setShowDeleteConfirm(false);
                setConfirmText("");
              }}
              className="rounded-full bg-zinc-100 px-4 py-2 text-xs text-zinc-500"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-zinc-400">找不到符合的已完成訂單</p>
      ) : (
        <div className="flex flex-col gap-2">
          {paged.map((s) => (
            <div key={s.id} className="flex items-start gap-2 rounded-2xl bg-white p-4 shadow-sm">
              <input type="checkbox" className="mt-1" checked={selected.includes(s.id)} onChange={() => toggle(s.id)} />
              <div className="flex-1 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-semibold text-purple-700">{s.shipmentNumber}</span>
                  <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700">
                    {sellerName(s)}
                  </span>
                  <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs text-purple-600">
                    {getDisplayShipmentStatusLabel(s.status, s.pickupMethod)}
                  </span>
                  {s.exportBatchId && (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">已匯出過</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  買家：{s.customerName ?? "-"}　平台訂單：{s.orderNumbers.join("、") || "-"}
                </p>
                <p className="text-xs text-zinc-400">
                  金額 NT$ {s.totalAmount}｜
                  {s.pickupMethod === "event_pickup" ? `面交：${s.eventPickupDisplayName ?? "-"}` : "賣貨便"}
                  {s.marketplaceOrderNumber ? `（${s.marketplaceOrderNumber}）` : ""}
                </p>
                {s.buyerNote && <p className="text-xs text-pink-600">買家備註：{s.buyerNote}</p>}
                {s.completedAt && (
                  <p className="text-xs text-zinc-400">
                    完成時間：{new Date(s.completedAt).toLocaleString("zh-TW")}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
    </div>
  );
}
