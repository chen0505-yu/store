"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { SupplementPaymentMethod, SupplementStatus } from "@/lib/types";

export interface ActionResult {
  success: boolean;
  message: string;
}

// 補款只由後台建立與修改，客戶只能查看（見 lib/data/orders.ts 的 supplements 欄位）。
// paymentMethod：有些補款會在貨到後透過賣貨便/貨到付款方式處理，不一定是匯款補款。
export async function createSupplement(
  orderId: string,
  amount: number,
  reason: string,
  status: SupplementStatus,
  note: string,
  paymentMethod: SupplementPaymentMethod
): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { error } = await supabase.from("supplements").insert({
    order_id: orderId,
    amount,
    reason: reason.trim() || null,
    status,
    payment_method: paymentMethod,
    note: note.trim() || null,
  });

  if (error) return { success: false, message: error.message };

  revalidatePath("/admin/preorder-orders");
  revalidatePath("/member/preorder-orders");
  return { success: true, message: "已新增補款" };
}
