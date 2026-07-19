"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentAdmin } from "@/lib/admin-auth";
import type { SupplementPaymentMethod, SupplementStatus } from "@/lib/types";

export interface ActionResult {
  success: boolean;
  message: string;
}

// 補款只由後台建立與修改，客戶只能查看（見 lib/data/orders.ts 的 supplements 欄位）。
// paymentMethod：有些補款會在貨到後透過賣貨便/貨到付款方式處理，不一定是匯款補款。
// OrderPaymentPanel 這個元件在葴葴預購（super_admin only）跟繪師預購（super_admin 或
// 該訂單所屬的繪師）後台頁面都共用，這裡要依訂單的 order_type 分別驗證身分，
// 避免繪師改到別人商店的訂單（伺服器端驗證，不只是前端沒顯示連結）。
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

  const { data: order } = await supabase
    .from("orders")
    .select("id, order_type")
    .eq("id", orderId)
    .in("order_type", ["preorder", "artist"])
    .maybeSingle();
  if (!order) return { success: false, message: "找不到這筆訂單" };

  const admin = await getCurrentAdmin();
  if (!admin) return { success: false, message: "沒有權限執行此操作" };

  if (order.order_type === "artist") {
    let authorized = admin.role === "super_admin";
    if (!authorized && admin.role === "artist" && admin.teacherId) {
      const { data: orderItems } = await supabase
        .from("order_items")
        .select("artist_group_id")
        .eq("order_id", orderId);
      const groupIds = Array.from(
        new Set((orderItems ?? []).map((oi) => oi.artist_group_id).filter((id): id is string => Boolean(id)))
      );
      const { data: groups } =
        groupIds.length > 0
          ? await supabase.from("artist_product_groups").select("teacher_id").in("id", groupIds)
          : { data: [] };
      authorized = (groups ?? []).length > 0 && (groups ?? []).every((g) => g.teacher_id === admin.teacherId);
    }
    if (!authorized) return { success: false, message: "沒有權限執行此操作" };
  } else if (admin.role !== "super_admin") {
    return { success: false, message: "沒有權限執行此操作" };
  }

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
  revalidatePath("/admin/artist/orders");
  revalidatePath("/member/artist-orders");
  return { success: true, message: "已新增補款" };
}
