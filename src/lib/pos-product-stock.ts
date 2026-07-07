import type { PosProductGroup } from "@/lib/pos-types";

// 商品庫存規則只寫這一份，資料層/前台都呼叫這裡，避免兩個地方各自算出不一致的結果。
//
// 細項（variants）只是給管理者自己記錄用（例如記錄大概哪個角色幾張，活動後自行盤點），
// 完全不參與庫存計算：主項 stockQuantity 永遠是唯一、真正的可販售庫存，
// 不論這個商品有沒有填細項都一樣，POS 結帳也只會扣這個欄位。
export function getEffectiveStock(group: Pick<PosProductGroup, "stockQuantity">): number {
  return group.stockQuantity;
}

export function isGroupSoldOut(group: Pick<PosProductGroup, "stockQuantity">): boolean {
  return group.stockQuantity <= 0;
}

// 只用來判斷後台是否要顯示細項記錄區塊，跟庫存計算無關。
export function hasVariants(group: Pick<PosProductGroup, "variants">): boolean {
  return group.variants.length > 0;
}
