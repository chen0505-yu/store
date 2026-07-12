"use server";

import { revalidatePath } from "next/cache";
import { getPosSupabaseServerClient as getSupabaseServerClient } from "@/lib/supabase/pos-server";
import { getCurrentStaff } from "@/lib/pos-auth";
import { getPosOrders } from "@/lib/data/pos-orders";
import type { PosActionResult, PosOrder } from "@/lib/pos-types";

export interface PosCheckoutInput {
  eventId: string;
  artistId: string;
  receivedAmount: number;
  items: { groupId: string; quantity: number }[];
  freebieOptionIds?: string[];
}

export interface PosCheckoutResult extends PosActionResult {
  orderNumber?: string;
}

// 唯一的結帳入口，實際扣庫存/建立訂單/贈品資格判斷與贈品庫存扣除邏輯都在 Supabase 端的
// pos_checkout() function 裡以單一交易完成（見 supabase/migrations/023_pos_freebies.sql），
// 避免現場多人同時結帳搶庫存時發生超賣、或訂單/贈品寫到一半的情況。
export async function checkoutPosOrder(input: PosCheckoutInput): Promise<PosCheckoutResult> {
  const staff = await getCurrentStaff();
  if (!staff) return { success: false, message: "請重新登入" };

  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  if (!input.items.length) return { success: false, message: "購物車是空的" };
  if (input.receivedAmount < 0) return { success: false, message: "收款金額不正確" };

  const { data, error } = await supabase.rpc("pos_checkout", {
    p_event_id: input.eventId,
    p_artist_id: input.artistId,
    p_staff_id: staff.id,
    p_received_amount: input.receivedAmount,
    p_items: input.items.map((i) => ({ group_id: i.groupId, quantity: i.quantity })),
    p_freebie_option_ids: input.freebieOptionIds ?? [],
  });

  if (error) return { success: false, message: error.message };

  revalidatePath(`/pos/${input.eventId}/${input.artistId}`);
  revalidatePath("/pos/admin/orders");
  revalidatePath("/pos/admin/stats");
  revalidatePath("/pos/admin/reports");

  return { success: true, message: "結帳完成", orderNumber: data as string };
}

// POS 前台「退貨」搜尋用：依訂單編號局部比對，不限定繪師/活動——小幫手可能要處理
// 到別攤或別場活動的訂單，只要有登入就能查得到，之後照樣走同一套 processReturn。
export async function searchPosOrdersByOrderNumber(query: string): Promise<PosOrder[]> {
  const staff = await getCurrentStaff();
  if (!staff) return [];
  const trimmed = query.trim();
  if (!trimmed) return [];
  return getPosOrders({ orderNumber: trimmed, limit: 10 });
}
