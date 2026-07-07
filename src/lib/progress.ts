import type { ArrivalStatus } from "@/lib/types";
import type { ShipmentItemStatus } from "@/lib/shipment-status";

// 商品進度（前台商品狀態、後台預購商品）：不特定買家，純粹依品項本身的到貨狀態（arrival_status）。
export const PRODUCT_PROGRESS_STEPS = ["預購中", "繪師出貨", "到台整理", "合併訂單完成"];

export function getProductArrivalProgressIndex(status: ArrivalStatus): number {
  switch (status) {
    case "preordering":
      return 0;
    case "not_arrived":
      return 1;
    case "arrived":
    case "packing":
      return 2;
    case "listed":
      return 3;
  }
}

// 訂單內單一品項的商品進度（會員訂單商品明細、後台預購訂單）：多了「已合併出貨」這個具體動作可以直接判斷，
// 比單純看 arrival_status 更準確——合併是「這筆訂單的這件商品」自己的動作，不是整個品項的狀態
// （同一品項不同買家的訂單，可能有些已經合併、有些還沒）。
export function getOrderItemProgressIndex(
  arrivalStatus: ArrivalStatus | null,
  merged: boolean
): number {
  if (merged) return 3;
  if (arrivalStatus === "preordering") return 0;
  if (!arrivalStatus || arrivalStatus === "not_arrived") return 1;
  return 2; // arrived / packing / listed，但這筆訂單的商品還沒被合併出貨
}

// 賣家（買家）預購訂單進度：下單完成 → 匯款完成 → 合併出貨單完成 → 已開賣場。
export const PREORDER_ORDER_PROGRESS_STEPS = ["下單完成", "匯款完成", "合併出貨單完成", "已開賣場"];

export function getPreorderOrderProgressIndex(input: {
  paymentConfirmed: boolean;
  allItemsMerged: boolean;
  mergedShipmentsListedOrBeyond: boolean;
}): number {
  if (input.allItemsMerged && input.mergedShipmentsListedOrBeyond) return 3;
  if (input.allItemsMerged) return 2;
  if (input.paymentConfirmed) return 1;
  return 0;
}

// 出貨訂單進度：等待賣場 → 開好賣場 → 填寫訂單編號 → 完成。
// 活動現場取貨／面交不需要賣貨便訂單編號，所以少一個步驟，用另一組步驟文字。
export function getShipmentProgressSteps(pickupMethod: "shipment" | "event_pickup" | null): string[] {
  if (pickupMethod === "event_pickup") return ["等待賣場", "面交準備完成", "完成"];
  return ["等待賣場", "開好賣場", "填寫訂單編號", "完成"];
}

export function getShipmentProgressIndex(input: {
  status: ShipmentItemStatus;
  pickupMethod: "shipment" | "event_pickup" | null;
  marketplaceOrderNumber: string | null;
}): number {
  if (input.pickupMethod === "event_pickup") {
    if (input.status === "completed") return 2;
    if (input.status === "listed") return 1;
    return 0;
  }
  if (input.status === "completed") return 3;
  if (input.status === "listed" && input.marketplaceOrderNumber) return 2;
  if (input.status === "listed") return 1;
  return 0;
}
