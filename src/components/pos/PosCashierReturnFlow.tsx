"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PosOrder } from "@/lib/pos-types";
import { searchPosOrdersByOrderNumber, getRecentPosOrders } from "@/lib/actions/pos-orders";
import { GlassCard } from "@/components/pos/GlassCard";
import { PosReturnOrderPanel } from "@/components/pos/PosReturnOrderPanel";

// POS 前台直接退貨：現場不方便每次都跑後台訂單管理頁面。點選退貨 → 從最近訂單挑
// 或輸入訂單編號搜尋 → 選到訂單 → 全退/部分退 → 完成，退貨的實際邏輯完全沿用
// PosReturnOrderPanel／processReturn（後台退貨用的同一套），沒有另外寫一份。
//
// 最近訂單刻意不當作 prop 從收銀頁 server component 直接帶進來——多數時候小幫手
// 整段收銀都不會按退貨，那份查詢就是白費，改成點退貨才即時查。
export function PosCashierReturnFlow({ eventId, artistId }: { eventId: string; artistId: string }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PosOrder[] | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<PosOrder | null>(null);
  const [recentOrders, setRecentOrders] = useState<PosOrder[]>([]);
  const [isLoadingRecent, startLoadRecent] = useTransition();
  const [isSearching, startSearch] = useTransition();

  function open() {
    setQuery("");
    setSearchResults(null);
    setSelectedOrder(null);
    setIsOpen(true);
    startLoadRecent(async () => {
      setRecentOrders(await getRecentPosOrders(eventId, artistId));
    });
  }

  function search() {
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }
    startSearch(async () => {
      const results = await searchPosOrdersByOrderNumber(query);
      setSearchResults(results);
    });
  }

  const listToShow = searchResults ?? recentOrders;

  return (
    <>
      <button type="button" onClick={open} className="pos-input px-4 py-2 text-sm">
        退貨
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <GlassCard className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-y-auto">
            {selectedOrder ? (
              <PosReturnOrderPanel
                order={selectedOrder}
                onClose={() => setSelectedOrder(null)}
                onSuccess={() => router.refresh()}
              />
            ) : (
              <>
                <h3 className="mb-3 text-lg font-semibold" style={{ color: "var(--pos-gold)" }}>
                  選擇要退貨的訂單
                </h3>
                <div className="mb-3 flex gap-2">
                  <input
                    className="pos-input flex-1 px-3 py-2 text-sm"
                    placeholder="輸入訂單編號搜尋（例如 LT000062）"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && search()}
                  />
                  <button
                    type="button"
                    onClick={search}
                    disabled={isSearching}
                    className="pos-glow-btn shrink-0 px-4 py-2 text-sm"
                  >
                    {isSearching ? "搜尋中..." : "搜尋"}
                  </button>
                </div>
                <p className="mb-2 text-xs text-[var(--pos-text-muted)]">
                  {searchResults ? `搜尋結果（${searchResults.length}）` : "最近訂單"}
                </p>
                <div className="flex flex-col gap-2">
                  {listToShow.map((order) => (
                    <button
                      key={order.id}
                      type="button"
                      onClick={() => setSelectedOrder(order)}
                      className="pos-input flex items-center justify-between px-3 py-2.5 text-left text-sm hover:brightness-125"
                    >
                      <div>
                        <p className="font-mono font-semibold" style={{ color: "var(--pos-gold)" }}>
                          {order.orderNumber}
                        </p>
                        <p className="text-xs text-[var(--pos-text-muted)]">
                          {new Date(order.createdAt).toLocaleString("zh-TW")}
                        </p>
                      </div>
                      <span>NT$ {order.totalAmount}</span>
                    </button>
                  ))}
                  {listToShow.length === 0 && (
                    <p className="text-sm text-[var(--pos-text-muted)]">
                      {searchResults ? "找不到符合的訂單" : isLoadingRecent ? "載入中..." : "這位繪師還沒有訂單"}
                    </p>
                  )}
                </div>
                <button type="button" onClick={() => setIsOpen(false)} className="pos-input mt-4 w-full py-2.5 text-sm">
                  取消
                </button>
              </>
            )}
          </GlassCard>
        </div>
      )}
    </>
  );
}
