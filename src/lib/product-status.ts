import type { ArrivalStatus, PreorderPaymentStatus, SupplementPaymentMethod } from "@/lib/types";

// 預購商品狀態的顯示順序與中文標籤。注意：不使用「已到貨」，一律顯示「已到台」。
export const PREORDER_STATUS_ORDER: ArrivalStatus[] = [
  "preordering",
  "not_arrived",
  "arrived",
  "packing",
  "listed",
];

export const PREORDER_STATUS_LABEL: Record<ArrivalStatus, string> = {
  preordering: "預購中",
  not_arrived: "未到貨",
  arrived: "已到台",
  packing: "整理中",
  listed: "已開賣貨便",
};

export const PAYMENT_STATUS_ORDER: PreorderPaymentStatus[] = [
  "not_remitted",
  "pending_confirmation",
  "confirmed",
  "underpaid",
  "needs_supplement",
  "cancelled",
];

export const PAYMENT_STATUS_LABEL: Record<PreorderPaymentStatus, string> = {
  not_remitted: "未匯款",
  pending_confirmation: "待確認",
  confirmed: "匯款完成",
  underpaid: "少匯款",
  needs_supplement: "需補款",
  cancelled: "已取消",
};

export const SUPPLEMENT_STATUS_LABEL: Record<
  "pending" | "completed" | "not_needed" | "cancelled",
  string
> = {
  pending: "待補款",
  completed: "已補款",
  not_needed: "不需補款",
  cancelled: "已取消",
};

export const SUPPLEMENT_PAYMENT_METHOD_ORDER: SupplementPaymentMethod[] = ["remittance", "cod"];

export const SUPPLEMENT_PAYMENT_METHOD_LABEL: Record<SupplementPaymentMethod, string> = {
  remittance: "匯款補款",
  cod: "貨到付款",
};
