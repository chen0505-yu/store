import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { OrderBonusSelectionView, OrderMessageView } from "@/lib/types";
import { getMessagesByOrderIds } from "@/lib/data/order-messages";

export interface AdminInstockOrderItem {
  productName: string;
  teacherName: string | null;
  productGroupName: string | null;
  variantName: string | null;
  quantity: number;
  price: number;
  subtotal: number;
}

export interface AdminInstockOrder {
  id: string;
  orderNumber: string;
  customerName: string | null;
  marketplaceOrderNumber: string | null;
  status: string;
  totalAmount: number;
  items: AdminInstockOrderItem[];
  bonusSelections: OrderBonusSelectionView[];
  messages: OrderMessageView[];
}

interface OrderItemRow {
  product_name: string;
  teacher_name: string | null;
  product_group_name: string | null;
  variant_name: string | null;
  quantity: number;
  price: number;
  subtotal: number;
}

interface OrderRow {
  id: string;
  order_number: string;
  customer_name: string | null;
  marketplace_order_number: string | null;
  status: string;
  total_amount: number;
  order_items: OrderItemRow[] | null;
}

// 現貨訂單改為買家自行完成賣貨便並回填訂單編號，後台需要一份清單顯示：
// 平台訂單編號、賣貨便訂單編號、買家名稱、商品（老師/品項/細項）、單價、小計、訂單總金額，方便出貨核對與對帳。
export async function getInstockOrdersForAdmin(): Promise<AdminInstockOrder[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const { data: orders, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, customer_name, marketplace_order_number, status, total_amount, order_items(product_name, teacher_name, product_group_name, variant_name, quantity, price, subtotal)"
    )
    .eq("order_type", "instock")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[LITAN] 讀取現貨訂單失敗", error.message);
    return [];
  }

  const rows = (orders ?? []) as unknown as OrderRow[];
  const orderIds = rows.map((o) => o.id);
  const [messagesByOrderId, { data: bonusSelections }] = await Promise.all([
    getMessagesByOrderIds(supabase, orderIds),
    supabase
      .from("order_bonus_selections")
      .select("order_id, condition_product_name, bonus_product_name, quantity")
      .in("order_id", orderIds),
  ]);

  const bonusByOrderId = new Map<string, OrderBonusSelectionView[]>();
  for (const b of bonusSelections ?? []) {
    const list = bonusByOrderId.get(b.order_id) ?? [];
    list.push({
      conditionProductName: b.condition_product_name,
      bonusProductName: b.bonus_product_name,
      quantity: b.quantity,
    });
    bonusByOrderId.set(b.order_id, list);
  }

  return rows.map((o) => ({
    id: o.id,
    orderNumber: o.order_number,
    customerName: o.customer_name,
    marketplaceOrderNumber: o.marketplace_order_number,
    status: o.status,
    totalAmount: Number(o.total_amount),
    items: (o.order_items ?? []).map((it) => ({
      productName: it.product_name,
      teacherName: it.teacher_name,
      productGroupName: it.product_group_name,
      variantName: it.variant_name,
      quantity: it.quantity,
      price: Number(it.price),
      subtotal: Number(it.subtotal),
    })),
    bonusSelections: bonusByOrderId.get(o.id) ?? [],
    messages: messagesByOrderId.get(o.id) ?? [],
  }));
}
