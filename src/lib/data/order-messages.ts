import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderMessageView } from "@/lib/types";

interface OrderMessageRow {
  id: string;
  order_id: string;
  author_type: "customer" | "admin";
  content: string;
  is_read: boolean;
  created_at: string;
}

// 依訂單 id 一次撈出所有留言，依建立時間排序，供客戶端與後台共用。
export async function getMessagesByOrderIds(
  supabase: SupabaseClient,
  orderIds: string[]
): Promise<Map<string, OrderMessageView[]>> {
  const map = new Map<string, OrderMessageView[]>();
  if (orderIds.length === 0) return map;

  const { data, error } = await supabase
    .from("order_messages")
    .select("id, order_id, author_type, content, is_read, created_at")
    .in("order_id", orderIds)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[LITAN] 讀取訂單留言失敗", error.message);
    return map;
  }

  for (const row of (data ?? []) as OrderMessageRow[]) {
    const list = map.get(row.order_id) ?? [];
    list.push({
      id: row.id,
      authorType: row.author_type,
      content: row.content,
      isRead: row.is_read,
      createdAt: row.created_at,
    });
    map.set(row.order_id, list);
  }
  return map;
}
