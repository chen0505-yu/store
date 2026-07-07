"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AdminShipment } from "@/lib/data/shipments";
import { markShipmentsPrinted } from "@/lib/actions/shipments";
import { ShipmentRow } from "./ShipmentRow";
import { Collapsible } from "./Collapsible";
import { Pagination } from "./Pagination";
import { getDisplayShipmentStatusLabel } from "@/lib/shipment-status";

const PAGE_SIZE = 20;

// 賣貨便出貨單一定要先填賣貨便訂單編號才能列印；活動現場取貨／面交不需要賣貨便編號。
function canPrintShipment(s: AdminShipment): boolean {
  return s.pickupMethod === "event_pickup" || Boolean(s.marketplaceOrderNumber);
}

type SupplementFilterKey = "has_supplement" | "supplement_pending" | "supplement_completed";
type PickupSegmentKey = "all" | "shipment" | "event_pickup";

const SUPPLEMENT_FILTER_OPTIONS: { key: SupplementFilterKey; label: string }[] = [
  { key: "has_supplement", label: "有二補" },
  { key: "supplement_pending", label: "待二補" },
  { key: "supplement_completed", label: "已二補" },
];

const PICKUP_SEGMENT_OPTIONS: { key: PickupSegmentKey; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "shipment", label: "賣貨便" },
  { key: "event_pickup", label: "面交／活動取貨" },
];

function matchesSupplementFilter(s: AdminShipment, filter: SupplementFilterKey): boolean {
  switch (filter) {
    case "has_supplement":
      return s.supplementStatus !== "none";
    case "supplement_pending":
      return s.supplementStatus === "pending";
    case "supplement_completed":
      return s.supplementStatus === "completed";
  }
}

// 出貨訂單摘要要明顯標出「賣貨便」或「面交：CWT 第一天」，跟後台預購訂單頁的分流方式一致。
function pickupMethodLabel(s: AdminShipment): string {
  return s.pickupMethod === "event_pickup" ? `面交：${s.eventPickupDisplayName ?? "-"}` : "賣貨便";
}

export function ShipmentList({ shipments }: { shipments: AdminShipment[] }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [pickupSegment, setPickupSegment] = useState<PickupSegmentKey>("all");
  const [supplementFilter, setSupplementFilter] = useState<SupplementFilterKey | null>(null);
  const [page, setPage] = useState(1);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return shipments
      .filter((s) => pickupSegment === "all" || (s.pickupMethod ?? "shipment") === pickupSegment)
      .filter((s) => !supplementFilter || matchesSupplementFilter(s, supplementFilter))
      .filter((s) => {
        if (!q) return true;
        return (
          (s.marketplaceOrderNumber ?? "").toLowerCase().includes(q) ||
          s.shipmentNumber.toLowerCase().includes(q) ||
          (s.customerName ?? "").toLowerCase().includes(q) ||
          s.orderNumbers.some((n) => n.toLowerCase().includes(q))
        );
      });
  }, [shipments, search, pickupSegment, supplementFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pagedShipments = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  );

  function toggleSelected(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const printableFiltered = useMemo(() => filtered.filter(canPrintShipment), [filtered]);
  const allPrintableSelected =
    printableFiltered.length > 0 && printableFiltered.every((s) => selected.includes(s.id));

  // 賣貨便跟面交／活動取貨不可混在同一批列印，避免同一批列印單裡有些顯示賣貨便編號、
  // 有些顯示活動場次，包貨時容易搞混。
  const selectedPickupMethods = useMemo(() => {
    const map = new Map(shipments.map((s) => [s.id, s.pickupMethod ?? "shipment"]));
    return new Set(selected.map((id) => map.get(id)).filter((v): v is "shipment" | "event_pickup" => Boolean(v)));
  }, [shipments, selected]);
  const hasMixedPrintSelection = selectedPickupMethods.size > 1;

  function toggleSelectAll() {
    if (allPrintableSelected) {
      setSelected([]);
    } else {
      setSelected(printableFiltered.map((s) => s.id));
    }
  }

  function handleBatchPrint() {
    if (selected.length === 0 || hasMixedPrintSelection) return;
    startTransition(async () => {
      await markShipmentsPrinted(selected);
      router.push(`/print?shipment=${selected.join(",")}`);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="搜尋出貨訂單編號／賣貨便訂單編號／買家名稱／平台訂單編號"
          className="flex-1 rounded-full border border-purple-200 px-4 py-2 text-sm"
        />
        <button
          onClick={toggleSelectAll}
          disabled={printableFiltered.length === 0}
          className="rounded-full bg-purple-100 px-4 py-2 text-sm font-medium text-purple-700 disabled:opacity-40"
        >
          {allPrintableSelected ? "取消全選" : "全選可列印"}
        </button>
        <button
          onClick={handleBatchPrint}
          disabled={selected.length === 0 || isPending || hasMixedPrintSelection}
          className="rounded-full bg-purple-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          批量列印（已選 {selected.length}）
        </button>
      </div>
      {hasMixedPrintSelection && (
        <p className="text-xs font-semibold text-red-500">
          賣貨便與面交／活動取貨商品不可混在同一批列印，請分開勾選列印。
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-zinc-500">取貨方式：</span>
        {PICKUP_SEGMENT_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => {
              setPickupSegment(opt.key);
              setPage(1);
            }}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              pickupSegment === opt.key ? "bg-purple-500 text-white" : "bg-purple-50 text-purple-600"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-zinc-500">二補：</span>
        {SUPPLEMENT_FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => {
              setSupplementFilter((prev) => (prev === opt.key ? null : opt.key));
              setPage(1);
            }}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              supplementFilter === opt.key ? "bg-pink-500 text-white" : "bg-pink-50 text-pink-600"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-zinc-400">找不到符合的出貨訂單</p>
      ) : (
        <div className="flex flex-col gap-3">
          {pagedShipments.map((s) => {
            const printable = canPrintShipment(s);
            return (
              <div key={s.id} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={selected.includes(s.id)}
                  disabled={!printable}
                  onChange={() => toggleSelected(s.id)}
                  title={printable ? undefined : "尚未填寫賣貨便訂單編號，無法列印"}
                  className="mt-5 h-4 w-4 disabled:cursor-not-allowed disabled:opacity-30"
                />
                <div className="flex-1">
                  <Collapsible
                    summary={
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-mono font-semibold text-purple-700">
                          {s.shipmentNumber}
                        </span>
                        <span className="text-zinc-500">買家：{s.customerName ?? "-"}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            s.pickupMethod === "event_pickup"
                              ? "bg-pink-100 text-pink-700"
                              : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {pickupMethodLabel(s)}
                        </span>
                        <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs text-purple-600">
                          {getDisplayShipmentStatusLabel(s.status, s.pickupMethod)}
                        </span>
                        <span className="text-xs text-zinc-400">NT$ {s.totalAmount}</span>
                        {s.printedAt && (
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">
                            已列印
                          </span>
                        )}
                      </div>
                    }
                  >
                    <ShipmentRow shipment={s} />
                  </Collapsible>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
    </div>
  );
}
