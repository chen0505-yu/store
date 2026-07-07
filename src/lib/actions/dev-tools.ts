"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export interface ActionResult {
  success: boolean;
  message: string;
}

// 依刪除順序排列（子表在前），避免外鍵約束擋下刪除。members/member_sessions、
// product_tags、instock_settings 刻意不清空：會員帳號要保留才能繼續用同一組帳號測試，
// Tag 目錄與現貨區開關屬於「系統設定」，不算測試業務資料。
const CLEARABLE_TABLES = [
  "shipment_items",
  "shipments",
  "order_messages",
  "supplements",
  "payments",
  "order_items",
  "orders",
  "stock_logs",
  "product_images",
  "products",
  "announcements",
  "teachers",
] as const;

// 清空測試資料：只允許在開發環境執行，正式部署（NODE_ENV=production）一律拒絕，
// 就算有人繞過前端直接呼叫這支 Server Action 也一樣擋下來。
export async function clearTestData(): Promise<ActionResult> {
  if (process.env.NODE_ENV !== "development") {
    return { success: false, message: "僅開發環境可執行此操作" };
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  for (const table of CLEARABLE_TABLES) {
    const { error } = await supabase.from(table).delete().not("id", "is", null);
    if (error) {
      return { success: false, message: `清空 ${table} 失敗：${error.message}` };
    }
  }

  revalidatePath("/", "layout");
  return { success: true, message: "已清空測試資料" };
}
