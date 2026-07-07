import type { PosCartLine, PosFreebieRule } from "@/lib/pos-types";

// 這份計算只給 POS 前台即時顯示用，伺服器端 pos_checkout() RPC 才是最終權威判斷
// （見 supabase/migrations/028_pos_freebie_simplify_quota_pool.sql），兩邊算法必須
// 一致，所以特別抽成單一函式讓前台重用，不要各寫一份。
//
// spend_threshold（滿額贈）規則一律走額度池模式，見下面 getQuotaPoolRules /
// computeQuotaUsed，不再用「賺到幾次固定名額」的方式呈現。這裡的 slot 概念只留給
// buy_product（購買指定商品送贈品）用：買 N 件賺 N 次，或只要買到就賺 1 次。
export interface PosFreebieEligibleSlot {
  rule: PosFreebieRule;
  earnedCount: number;
}

export function computeEligibleFreebieSlots(
  cartLines: PosCartLine[],
  rules: PosFreebieRule[]
): PosFreebieEligibleSlot[] {
  const slots: PosFreebieEligibleSlot[] = [];

  for (const rule of rules) {
    if (!rule.isActive || rule.ruleType !== "buy_product") continue;

    const purchasedQty = cartLines
      .filter((l) => l.groupId === rule.triggerGroupId)
      .reduce((sum, l) => sum + l.quantity, 0);
    const earnedCount = rule.isStackable ? purchasedQty : purchasedQty >= 1 ? 1 : 0;

    if (earnedCount > 0) slots.push({ rule, earnedCount });
  }

  return slots;
}

// 額度池模式：只給 spend_threshold 規則用。購物車小計就是可用額度，每次選一款
// 贈品就花掉它 thresholdAmount 的額度，可以任意組合，只要花費總和不超過小計。
export function getQuotaPoolRules(rules: PosFreebieRule[]): PosFreebieRule[] {
  return rules.filter(
    (r) => r.isActive && r.ruleType === "spend_threshold" && (r.thresholdAmount ?? 0) > 0
  );
}

// picks：目前已選的贈品 optionId 清單（可重複，一個 option 選兩次就出現兩次）。
// 回傳目前已花掉的額度總和。
export function computeQuotaUsed(picks: string[], rules: PosFreebieRule[]): number {
  let used = 0;
  for (const optionId of picks) {
    const rule = rules.find((r) => r.options.some((o) => o.id === optionId));
    if (rule?.thresholdAmount) used += rule.thresholdAmount;
  }
  return used;
}
