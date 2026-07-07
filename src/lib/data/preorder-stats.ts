import { getSupabaseServerClient } from "@/lib/supabase/server";

export interface VariantStatEntry {
  variantName: string;
  quantity: number;
}

export interface GroupStatEntry {
  groupName: string;
  variants: VariantStatEntry[];
  groupTotal: number;
}

export interface TeacherStatEntry {
  teacherCode: string;
  teacherName: string;
  groups: GroupStatEntry[];
  teacherTotal: number;
}

interface OrderItemLookupRow {
  product_group_name: string | null;
  variant_name: string | null;
  product_name: string;
  teacher_name: string | null;
  teacher_code: string | null;
  quantity: number;
}

// 廠商訂貨用：每位老師一張卡片，卡片內依「品項 → 細項」分組列出數量。
// 只計入已確認匯款、或補款已完成的訂單，未匯款/待確認/已取消/黑名單會員的訂單一律不算。
export async function getPreorderQuantityStats(): Promise<TeacherStatEntry[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const { data: orders, error: orderError } = await supabase
    .from("orders")
    .select("id, user_id, payment_status")
    .eq("order_type", "preorder")
    .in("payment_status", ["confirmed", "needs_supplement"]);

  if (orderError) {
    console.error("[LITAN] 讀取預購訂單失敗", orderError.message);
    return [];
  }

  let qualifyingOrders = orders ?? [];

  // 補款完成：payment_status 停在「需補款」，但實際的二補紀錄都已經完成付款，視為有效訂單。
  const needsSupplementOrderIds = qualifyingOrders
    .filter((o) => o.payment_status === "needs_supplement")
    .map((o) => o.id);
  if (needsSupplementOrderIds.length > 0) {
    const { data: supplements } = await supabase
      .from("supplements")
      .select("order_id, status")
      .in("order_id", needsSupplementOrderIds);
    const supplementsByOrder = new Map<string, string[]>();
    for (const s of supplements ?? []) {
      const list = supplementsByOrder.get(s.order_id) ?? [];
      list.push(s.status);
      supplementsByOrder.set(s.order_id, list);
    }
    const settledOrderIds = new Set(
      needsSupplementOrderIds.filter((id) => {
        const statuses = supplementsByOrder.get(id) ?? [];
        return statuses.length > 0 && statuses.every((s) => s === "completed" || s === "not_needed");
      })
    );
    qualifyingOrders = qualifyingOrders.filter(
      (o) => o.payment_status === "confirmed" || settledOrderIds.has(o.id)
    );
  }

  // 黑名單會員的訂單不計入，即使付款狀態符合也不算。
  const userIds = Array.from(
    new Set(qualifyingOrders.map((o) => o.user_id).filter((id): id is string => Boolean(id)))
  );
  if (userIds.length > 0) {
    const { data: members } = await supabase
      .from("members")
      .select("id, is_blacklisted")
      .in("id", userIds);
    const blacklistedIds = new Set((members ?? []).filter((m) => m.is_blacklisted).map((m) => m.id));
    qualifyingOrders = qualifyingOrders.filter((o) => !o.user_id || !blacklistedIds.has(o.user_id));
  }

  const orderIds = qualifyingOrders.map((o) => o.id);
  if (orderIds.length === 0) return [];

  const { data: items, error: itemsError } = await supabase
    .from("order_items")
    .select("product_group_name, variant_name, product_name, teacher_name, teacher_code, quantity")
    .in("order_id", orderIds);

  if (itemsError) {
    console.error("[LITAN] 讀取訂單明細失敗", itemsError.message);
    return [];
  }

  const teacherMap = new Map<string, TeacherStatEntry>();
  for (const it of (items ?? []) as OrderItemLookupRow[]) {
    const teacherKey = it.teacher_code ?? "-";
    let teacher = teacherMap.get(teacherKey);
    if (!teacher) {
      teacher = {
        teacherCode: it.teacher_code ?? "-",
        teacherName: it.teacher_name ?? "-",
        groups: [],
        teacherTotal: 0,
      };
      teacherMap.set(teacherKey, teacher);
    }

    const groupName = it.product_group_name ?? it.product_name;
    let group = teacher.groups.find((g) => g.groupName === groupName);
    if (!group) {
      group = { groupName, variants: [], groupTotal: 0 };
      teacher.groups.push(group);
    }

    const variantName = it.variant_name ?? it.product_name;
    let variant = group.variants.find((v) => v.variantName === variantName);
    if (!variant) {
      variant = { variantName, quantity: 0 };
      group.variants.push(variant);
    }

    variant.quantity += it.quantity;
    group.groupTotal += it.quantity;
    teacher.teacherTotal += it.quantity;
  }

  return Array.from(teacherMap.values()).sort((a, b) => a.teacherCode.localeCompare(b.teacherCode));
}
