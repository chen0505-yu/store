import type { Product } from "@/lib/types";

export type InstockPhase = "closed" | "not_started" | "open" | "ended";

export interface InstockSettings {
  isOpen: boolean;
  startsAt: string | null;
  endsAt: string | null;
}

// 現貨區狀態機：關閉 → （開放但未到開始時間）尚未開始 → 開放期間 → （超過結束時間）已結束。
export function getInstockPhase(
  settings: InstockSettings | null,
  now: number = Date.now()
): InstockPhase {
  if (!settings || !settings.isOpen) return "closed";
  if (settings.startsAt && now < new Date(settings.startsAt).getTime()) return "not_started";
  if (settings.endsAt && now > new Date(settings.endsAt).getTime()) return "ended";
  return "open";
}

export type PreorderPhase = "not_started" | "active" | "ended";

// 預購商品的下單時間窗，與 arrival_status（到貨追蹤）是兩件互不影響的事。
export function getPreorderPhase(
  product: Pick<Product, "preorderStartsAt" | "preorderEndsAt">,
  now: number = Date.now()
): PreorderPhase {
  if (product.preorderStartsAt && now < new Date(product.preorderStartsAt).getTime()) {
    return "not_started";
  }
  if (product.preorderEndsAt && now > new Date(product.preorderEndsAt).getTime()) {
    return "ended";
  }
  return "active";
}

export type RemittancePhase = "not_started" | "active" | "ended";

// 繪師匯款規則三態：未到開始時間「尚未開放匯款」、期間內顯示匯款表單、超過截止時間「匯款期限已截止」。
export function getRemittancePhase(
  window: { remittanceStartsAt: string | null; remittanceEndsAt: string | null },
  now: number = Date.now()
): RemittancePhase {
  if (window.remittanceStartsAt && now < new Date(window.remittanceStartsAt).getTime()) {
    return "not_started";
  }
  if (window.remittanceEndsAt && now > new Date(window.remittanceEndsAt).getTime()) {
    return "ended";
  }
  return "active";
}

export const BLACKLIST_MESSAGE = "您的帳號目前無法下單，請聯繫管理員。";

// 統一計算「這個商品現在能不能加入購物車／下單」，商品卡片與商品詳細頁共用同一套規則，
// 下單的 Server Action 也用同一套函式再驗證一次，避免只靠前端擋。
// 黑名單優先於其他規則：不管預購還是現貨，被列入黑名單一律不能加入購物車。
export function getProductDisabledReason(
  product: Pick<
    Product,
    "type" | "isSoldOut" | "stockQuantity" | "preorderStartsAt" | "preorderEndsAt"
  >,
  instockPhase: InstockPhase | null,
  isBlacklisted = false,
  now: number = Date.now()
): string | null {
  if (isBlacklisted) return BLACKLIST_MESSAGE;

  if (product.type === "preorder") {
    const phase = getPreorderPhase(product, now);
    if (phase === "not_started") return "預購尚未開始";
    if (phase === "ended") return "預購已結束";
    return null;
  }

  if (instockPhase === "ended") return "期間限定已結束";
  if (product.isSoldOut || (product.stockQuantity ?? 0) <= 0) return "已售完";
  return null;
}

// 預購架構改為老師/品項/細項：預購時間設在老師賣場層級（見 getPreorderPhase，
// Teacher 也有 preorderStartsAt/preorderEndsAt 兩個欄位，結構跟 Product 相同可以共用）。
// 這裡判斷「細項」能不能加入購物車：黑名單優先，其次是賣場的預購時間窗，最後是細項本身是否停用。
export function getVariantDisabledReason(
  teacher: Pick<Product, "preorderStartsAt" | "preorderEndsAt">,
  variantIsActive: boolean,
  isBlacklisted = false,
  now: number = Date.now()
): string | null {
  if (isBlacklisted) return BLACKLIST_MESSAGE;

  const phase = getPreorderPhase(teacher, now);
  if (phase === "not_started") return "預購尚未開始";
  if (phase === "ended") return "預購已結束";
  if (!variantIsActive) return "已停售";
  return null;
}

// 現貨架構改為老師/品項/細項：庫存記在細項上，能不能加入購物車看現貨區全域開關/期間
// （instockPhase）、細項本身是否停用、以及庫存是否足夠，跟預購的時間窗規則互不影響。
export function getInstockVariantDisabledReason(
  instockPhase: InstockPhase,
  variant: { isActive: boolean; isSoldOut: boolean; stockQuantity: number },
  isBlacklisted = false
): string | null {
  if (isBlacklisted) return BLACKLIST_MESSAGE;
  if (instockPhase === "closed") return "現貨區整理中，尚未開放";
  if (instockPhase === "not_started") return "現貨尚未開始";
  if (instockPhase === "ended") return "期間限定已結束";
  if (!variant.isActive) return "已下架";
  if (variant.isSoldOut || variant.stockQuantity <= 0) return "已售完";
  return null;
}
