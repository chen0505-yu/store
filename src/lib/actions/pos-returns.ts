"use server";

import { revalidatePath } from "next/cache";
import { getPosSupabaseServerClient as getSupabaseServerClient } from "@/lib/supabase/pos-server";
import { getCurrentStaff } from "@/lib/pos-auth";
import type { PosActionResult } from "@/lib/pos-types";

export interface ProcessReturnInput {
  orderId: string;
  reason: string | null;
  items: { orderItemId: string; quantity: number }[];
}

export interface ProcessReturnResult extends PosActionResult {
  refundAmount?: number;
}

// 退貨（整張訂單退貨 = 把所有品項都選進 items；單一品項退貨 = 只選那一項）。
// 實際邏輯在 Supabase 端的 pos_process_return() function 裡以單一交易完成
// （見 supabase/migrations/026_pos_returns.sql）：扣不會動原訂單，只新增退貨紀錄，
// 並把商品/贈品庫存加回去，任何一步失敗（超退、找不到訂單等）整筆 rollback。
//
// 換貨：這裡只處理「退掉原商品」，新商品請小幫手直接回 POS 收銀畫面重新結帳，
// 這裡顯示的退款金額可以拿來跟新訂單金額核對應補收/應退款的差額。
export async function processReturn(input: ProcessReturnInput): Promise<ProcessReturnResult> {
  const staff = await getCurrentStaff();
  if (!staff) return { success: false, message: "請重新登入" };

  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  if (!input.items.length) return { success: false, message: "請選擇要退貨的商品" };

  const { data, error } = await supabase.rpc("pos_process_return", {
    p_order_id: input.orderId,
    p_staff_id: staff.id,
    p_reason: input.reason,
    p_items: input.items.map((i) => ({ orderItemId: i.orderItemId, quantity: i.quantity })),
  });

  if (error) return { success: false, message: error.message };

  revalidatePath("/pos/admin/orders");
  revalidatePath("/pos/admin/stats");
  revalidatePath("/pos/admin/reports");
  revalidatePath("/pos/admin/settlement");
  revalidatePath("/pos", "layout");

  const refundAmount = Number((data as { refundAmount: number })?.refundAmount ?? 0);
  return { success: true, message: `退貨完成，退款 NT$ ${refundAmount}`, refundAmount };
}
