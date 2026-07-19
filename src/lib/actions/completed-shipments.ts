"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentAdmin } from "@/lib/admin-auth";

export interface ActionResult {
  success: boolean;
  message: string;
}

// artist 角色只能匯出/刪除自己商店的出貨訂單：透過 shipment_items -> order_items.artist_group_id
// -> artist_product_groups.teacher_id 反查，伺服器端驗證每一筆都屬於自己（不是只靠前端不顯示）。
// super_admin 永遠允許。
async function verifyOwnsAllShipments(
  supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>,
  shipmentIds: string[],
  admin: NonNullable<Awaited<ReturnType<typeof getCurrentAdmin>>>
): Promise<boolean> {
  if (admin.role === "super_admin") return true;
  if (admin.role !== "artist" || !admin.teacherId) return false;

  const { data: shipmentItems } = await supabase
    .from("shipment_items")
    .select("shipment_id, order_item_id")
    .in("shipment_id", shipmentIds);
  const orderItemIds = Array.from(new Set((shipmentItems ?? []).map((si) => si.order_item_id)));
  if (orderItemIds.length === 0) return false;

  const { data: orderItems } = await supabase
    .from("order_items")
    .select("id, artist_group_id")
    .in("id", orderItemIds);
  const groupIds = Array.from(
    new Set((orderItems ?? []).map((oi) => oi.artist_group_id).filter((id): id is string => Boolean(id)))
  );
  if (groupIds.length === 0) return false;

  const { data: groups } = await supabase.from("artist_product_groups").select("id, teacher_id").in("id", groupIds);
  return (groups ?? []).length > 0 && (groups ?? []).every((g) => g.teacher_id === admin.teacherId);
}

// 已完成訂單「匯出 Excel」：建立一筆 export_batches 紀錄，並把選取的出貨訂單全部標記
// exported_at/export_batch_id，之後才有資格被批量永久刪除（見 deleteCompletedShipments）。
// 只有 super_admin 或這批出貨訂單所屬的繪師本人可以匯出。
export async function markShipmentsExported(shipmentIds: string[]): Promise<ActionResult & { batchId?: string }> {
  if (shipmentIds.length === 0) return { success: false, message: "請至少選擇一筆出貨訂單" };

  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const admin = await getCurrentAdmin();
  if (!admin) return { success: false, message: "沒有權限執行此操作" };
  if (!(await verifyOwnsAllShipments(supabase, shipmentIds, admin))) {
    return { success: false, message: "沒有權限執行此操作" };
  }

  const { data: shipments } = await supabase
    .from("shipments")
    .select("id, status")
    .in("id", shipmentIds);
  if (!shipments || shipments.length !== shipmentIds.length) {
    return { success: false, message: "找不到部分出貨訂單" };
  }
  if (shipments.some((s) => s.status !== "completed")) {
    return { success: false, message: "只能匯出已完成的出貨訂單" };
  }

  const { data: batch, error: batchError } = await supabase
    .from("export_batches")
    .insert({
      exported_by_admin_id: admin.id,
      exported_by_label: admin.displayName,
      row_count: shipmentIds.length,
    })
    .select("id")
    .single();

  if (batchError || !batch) return { success: false, message: batchError?.message ?? "建立匯出批次失敗" };

  const { error } = await supabase
    .from("shipments")
    .update({ exported_at: new Date().toISOString(), export_batch_id: batch.id })
    .in("id", shipmentIds);

  if (error) return { success: false, message: error.message };

  revalidatePath("/admin/completed-shipments");
  revalidatePath("/admin/artist/completed");
  return { success: true, message: `已匯出 ${shipmentIds.length} 筆並記錄批次`, batchId: batch.id };
}

export interface DeleteCompletedShipmentsResult extends ActionResult {
  deletedShipmentCount?: number;
  deletedOrderCount?: number;
}

// 已完成訂單批量永久刪除：實際刪除邏輯（含資格驗證、transaction、失敗整批回滾）都在資料庫端的
// delete_completed_shipments() function（見 migration 037），這裡只負責呼叫 RPC 並轉換錯誤訊息。
export async function deleteCompletedShipments(shipmentIds: string[]): Promise<DeleteCompletedShipmentsResult> {
  if (shipmentIds.length === 0) return { success: false, message: "請至少選擇一筆出貨訂單" };

  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const admin = await getCurrentAdmin();
  if (!admin) return { success: false, message: "沒有權限執行此操作" };
  if (!(await verifyOwnsAllShipments(supabase, shipmentIds, admin))) {
    return { success: false, message: "沒有權限執行此操作" };
  }

  const { data, error } = await supabase.rpc("delete_completed_shipments", { p_shipment_ids: shipmentIds });

  if (error) return { success: false, message: error.message };

  const result = data as { deleted_shipment_count: number; deleted_order_count: number };

  revalidatePath("/admin/completed-shipments");
  revalidatePath("/admin/artist/completed");
  revalidatePath("/admin/preorder-orders");
  revalidatePath("/admin/artist/orders");
  revalidatePath("/admin/shipments");
  revalidatePath("/admin/artist/shipments");

  return {
    success: true,
    message: `已永久刪除 ${result.deleted_shipment_count} 筆出貨訂單、${result.deleted_order_count} 筆平台訂單`,
    deletedShipmentCount: result.deleted_shipment_count,
    deletedOrderCount: result.deleted_order_count,
  };
}
