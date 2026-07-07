// 同人活動 POS 系統的領域型別，跟 src/lib/types.ts（網路商城）完全獨立。

export interface PosActionResult {
  success: boolean;
  message: string;
}

export interface PosEvent {
  id: string;
  name: string;
  eventDate: string | null;
  dayLabel: string | null;
  boothNumber: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface PosArtist {
  id: string;
  eventId: string;
  artistCode: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
}

export interface PosProductVariant {
  id: string;
  groupId: string;
  name: string;
  stockQuantity: number;
  sortOrder: number;
}

// 商品主項/分類（例如「小卡」）。stockQuantity 永遠是唯一、真正的可販售庫存，
// variants 只是管理者自己記錄用（不影響庫存計算，見 src/lib/pos-product-stock.ts）。
export interface PosProductGroup {
  id: string;
  artistId: string;
  name: string;
  imageUrl: string | null;
  price: number;
  note: string | null;
  stockQuantity: number;
  isActive: boolean;
  sortOrder: number;
  variants: PosProductVariant[];
}

export interface PosOrderItem {
  id: string;
  groupId: string | null;
  groupName: string;
  variantId: string | null;
  variantName: string | null;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  isFreebie: boolean;
  returnedQuantity: number;
}

export interface PosReturn {
  id: string;
  orderId: string;
  staffName: string | null;
  reason: string | null;
  refundAmount: number;
  createdAt: string;
}

export interface PosOrder {
  id: string;
  orderNumber: string;
  eventId: string;
  eventName: string;
  eventDayLabel: string | null;
  eventBoothNumber: string | null;
  artistId: string;
  artistName: string;
  staffId: string | null;
  staffName: string | null;
  subtotalAmount: number;
  totalAmount: number;
  receivedAmount: number;
  changeAmount: number;
  createdAt: string;
  items: PosOrderItem[];
}

// POS 收銀購物車：只到商品主項層級，沒有細項概念（小幫手不用選細項）。
export interface PosCartLine {
  groupId: string;
  groupName: string;
  unitPrice: number;
  quantity: number;
  stockQuantity: number;
  note: string | null;
}

export type PosFreebieRuleType = "spend_threshold" | "buy_product";

export interface PosFreebieOption {
  id: string;
  ruleId: string;
  name: string;
  stockQuantity: number;
  sortOrder: number;
}

// 滿額/指定商品送贈品規則。spend_threshold 一律走額度池邏輯（購物車小計是可用額度，
// thresholdAmount 是這款贈品要花掉的額度，可任意組合，見 pos-freebie-eligibility.ts）。
// isStackable 只用在 buy_product：買 N 件賺 N 次，或只要買到就賺 1 次。
export interface PosFreebieRule {
  id: string;
  artistId: string;
  name: string;
  ruleType: PosFreebieRuleType;
  thresholdAmount: number | null; // 只用於 spend_threshold
  triggerGroupId: string | null; // 只用於 buy_product
  isStackable: boolean; // 只用於 buy_product
  isActive: boolean;
  sortOrder: number;
  options: PosFreebieOption[];
}

// 給畫面顯示用的活動麵包屑，例如「CWT69 Day1｜A01」。
export function formatEventLabel(event: Pick<PosEvent, "name" | "dayLabel" | "boothNumber">): string {
  const parts = [event.dayLabel ? `${event.name} ${event.dayLabel}` : event.name];
  if (event.boothNumber) parts.push(event.boothNumber);
  return parts.join("｜");
}
