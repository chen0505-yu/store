import type { ArrivalStatus } from "@/lib/types";

export type ShipmentItemStatus =
  | "not_arrived"
  | "arrived"
  | "packing"
  | "listed"
  | "completed";

// listed 的中文標籤跟商品後台的 PREORDER_STATUS_LABEL.listed 保持一致（都是「已開賣貨便」），
// 避免同一個狀態在商品後台跟訂單頁顯示不同文字。
export const SHIPMENT_STATUS_LABEL: Record<ShipmentItemStatus, string> = {
  not_arrived: "未到貨",
  arrived: "已到貨",
  packing: "整理中",
  listed: "已開賣貨便",
  completed: "完成",
};

// 出貨批次的階段順序：合併出貨後從「整理中」開始，逐步推進到「完成」。
export const SHIPMENT_STATUS_ORDER: ShipmentItemStatus[] = [
  "not_arrived",
  "arrived",
  "packing",
  "listed",
  "completed",
];

// 尚未合併出貨的商品可以勾選合併的狀態：已到台／整理中／已開賣貨便都代表商品已經在手上。
export const MERGEABLE_SHIPMENT_STATUSES: ShipmentItemStatus[] = ["arrived", "packing", "listed"];

// 品項到貨狀態（product_groups.arrival_status）跟尚未合併出貨的 shipment_items.status
// 是兩個獨立欄位但意義應該完全同步：品項狀態改變時，尚未合併出貨的商品要跟著變成一樣的狀態，
// 而不是像過去那樣把 arrived/packing/listed 全部收斂成單一個 arrived，導致商品後台跟訂單頁不一致。
export function mapArrivalStatusToShipmentStatus(status: ArrivalStatus): ShipmentItemStatus {
  if (status === "arrived" || status === "packing" || status === "listed") return status;
  return "not_arrived"; // preordering、not_arrived 都還沒到貨
}

// 「已開賣貨便」對活動現場取貨的訂單沒有意義（不會上架賣貨便，是現場面交），
// 顯示時要換成「面交」，但不影響底層狀態欄位本身（狀態流程、篩選邏輯都不變）。
export function getDisplayShipmentStatusLabel(
  status: ShipmentItemStatus,
  pickupMethod?: "shipment" | "event_pickup" | null
): string {
  if (status === "listed" && pickupMethod === "event_pickup") return "面交";
  return SHIPMENT_STATUS_LABEL[status];
}
