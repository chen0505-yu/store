import type { AdminShipmentItem } from "@/lib/data/admin-shipment-items";
import type { AdminShipment } from "@/lib/data/shipments";
import { MERGEABLE_SHIPMENT_STATUSES } from "@/lib/shipment-status";

// Dashboard 待處理事項卡片的 ?filter= 參數 → 訂單/出貨單頁面的預先過濾條件，
// 共用同一份判斷邏輯，避免葴葴預購／繪師預購兩個頁面各寫一份、日後容易對不上。
export type OrderItemFilterKey = "unprocessed" | "mergeable";
export type ShipmentFilterKey = "missing_marketplace_number" | "incomplete";

export function filterShipmentItems(items: AdminShipmentItem[], filter?: string): AdminShipmentItem[] {
  if (filter === "unprocessed") return items.filter((i) => i.orderStatus !== "completed");
  if (filter === "mergeable") return items.filter((i) => MERGEABLE_SHIPMENT_STATUSES.includes(i.status) && !i.merged);
  return items;
}

export function filterShipments(shipments: AdminShipment[], filter?: string): AdminShipment[] {
  if (filter === "missing_marketplace_number") {
    return shipments.filter((s) => s.pickupMethod !== "event_pickup" && !s.marketplaceOrderNumber);
  }
  if (filter === "incomplete") return shipments.filter((s) => s.status !== "completed");
  return shipments;
}
