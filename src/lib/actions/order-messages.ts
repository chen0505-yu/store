"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/auth";

export interface ActionResult {
  success: boolean;
  message: string;
}

function revalidateOrderPaths() {
  revalidatePath("/member/preorder-orders");
  revalidatePath("/member/instock-orders");
  revalidatePath("/admin/preorder-orders");
  revalidatePath("/admin/instock-orders");
}

// 客戶在自己的訂單內留言，補充注意事項或詢問訂單狀態。留言數量不限。
export async function postOrderMessage(orderId: string, content: string): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };
  if (!content.trim()) return { success: false, message: "請輸入留言內容" };

  const member = await getCurrentMember();
  if (!member) return { success: false, message: "請先登入會員" };

  const { data: order } = await supabase
    .from("orders")
    .select("id")
    .eq("id", orderId)
    .eq("user_id", member.id)
    .maybeSingle();

  if (!order) return { success: false, message: "找不到這筆訂單，或您不是這筆訂單的買家" };

  const { error } = await supabase.from("order_messages").insert({
    order_id: orderId,
    author_type: "customer",
    content: content.trim(),
  });

  if (error) return { success: false, message: error.message };

  revalidateOrderPaths();
  return { success: true, message: "已送出留言" };
}

// 後台回覆客戶留言，不受買家身分限制。
export async function postAdminReply(orderId: string, content: string): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };
  if (!content.trim()) return { success: false, message: "請輸入回覆內容" };

  const { error } = await supabase.from("order_messages").insert({
    order_id: orderId,
    author_type: "admin",
    content: content.trim(),
  });

  if (error) return { success: false, message: error.message };

  revalidateOrderPaths();
  return { success: true, message: "已送出回覆" };
}

// 打開留言區時呼叫：標記「對方留言」為已讀。
// 客戶打開 → 後台的留言（admin 留言）標記已讀 → customer_unread_count 歸零。
// 後台打開 → 客戶的留言（customer 留言）標記已讀 → admin_unread_count 歸零。
export async function markOrderMessagesRead(
  orderId: string,
  role: "customer" | "admin"
): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const authorTypeToMark = role === "customer" ? "admin" : "customer";

  if (role === "customer") {
    const member = await getCurrentMember();
    if (!member) return { success: false, message: "請先登入會員" };

    const { data: order } = await supabase
      .from("orders")
      .select("id")
      .eq("id", orderId)
      .eq("user_id", member.id)
      .maybeSingle();

    if (!order) return { success: false, message: "找不到這筆訂單，或您不是這筆訂單的買家" };
  }

  const { error } = await supabase
    .from("order_messages")
    .update({ is_read: true })
    .eq("order_id", orderId)
    .eq("author_type", authorTypeToMark)
    .eq("is_read", false);

  if (error) return { success: false, message: error.message };

  revalidateOrderPaths();
  return { success: true, message: "已標記為已讀" };
}
