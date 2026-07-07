// 二補金額判斷共用邏輯：細項若有設定二補金額，優先套用細項的；否則套用品項的。
// group/variant 的 surcharge_amount 是 nullable numeric：null 代表「未設定」，0 代表「已確認不用補」。
export interface SurchargeSource {
  surcharge_amount: number | string | null;
  surcharge_reason: string | null;
}

export interface EffectiveSurcharge {
  amount: number | null;
  reason: string | null;
}

export function getEffectiveSurcharge(
  group: SurchargeSource | undefined,
  variant: SurchargeSource | undefined
): EffectiveSurcharge {
  const hasVariantAmount = variant?.surcharge_amount !== null && variant?.surcharge_amount !== undefined;
  if (hasVariantAmount) {
    return {
      amount: Number(variant!.surcharge_amount),
      reason: variant?.surcharge_reason ?? group?.surcharge_reason ?? null,
    };
  }
  const hasGroupAmount = group?.surcharge_amount !== null && group?.surcharge_amount !== undefined;
  if (hasGroupAmount) {
    return { amount: Number(group!.surcharge_amount), reason: group?.surcharge_reason ?? null };
  }
  return { amount: null, reason: null };
}
