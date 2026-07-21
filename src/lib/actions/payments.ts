"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/auth";

export interface ActionResult {
  success: boolean;
  message: string;
}

export interface SubmitPaymentInput {
  remittanceDate: string; // yyyy-mm-dd
  remittanceTime: string; // HH:mm
  accountLast5: string;
  screenshotUrl: string;
  actualAmount: number;
}

// 客戶在自己的預購訂單內提交匯款資料：匯款日期、時間、帳號末五碼、截圖、實際匯款金額。
// 少匯款多少一律由「訂單總額 - 實際匯款金額」即時計算，不讓客戶自己心算再填，避免填錯。
// 一張訂單只有一筆匯款紀錄，重新提交會覆蓋更新，並把付款狀態改回「待確認」讓後台重新審核。
export async function submitPayment(
  orderId: string,
  input: SubmitPaymentInput
): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const member = await getCurrentMember();
  if (!member) return { success: false, message: "請先登入會員" };

  if (!input.remittanceDate) return { success: false, message: "請選擇匯款日期" };
  if (!input.remittanceTime) return { success: false, message: "請選擇匯款時間" };
  if (!input.accountLast5.trim()) return { success: false, message: "請輸入帳號末五碼（無卡匯款請填：無卡）" };
  if (!input.screenshotUrl) return { success: false, message: "請上傳匯款截圖" };
  if (input.actualAmount === null || input.actualAmount === undefined) {
    return { success: false, message: "請輸入實際匯款金額" };
  }

  const { data: order } = await supabase
    .from("orders")
    .select("id")
    .eq("id", orderId)
    .eq("user_id", member.id)
    .in("order_type", ["preorder", "artist"])
    .maybeSingle();

  if (!order) {
    return { success: false, message: "找不到這筆訂單，或您不是這筆訂單的買家" };
  }

  const { error } = await supabase.from("payments").upsert(
    {
      order_id: orderId,
      remittance_date: input.remittanceDate,
      remittance_time: input.remittanceTime || null,
      account_last5: input.accountLast5.trim(),
      screenshot_url: input.screenshotUrl || null,
      actual_amount: input.actualAmount || 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "order_id" }
  );

  if (error) return { success: false, message: error.message };

  await supabase
    .from("orders")
    .update({ payment_status: "pending_confirmation" })
    .eq("id", orderId);

  revalidatePath("/member/preorder-orders");
  revalidatePath("/admin/preorder-orders");
  revalidatePath("/member/artist-orders");
  revalidatePath("/admin/artist/orders");
  return { success: true, message: "已提交匯款資料，請等待後台確認" };
}
