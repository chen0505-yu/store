"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { ArrivalStatus, ProductType } from "@/lib/types";
import { PREORDER_STATUS_LABEL } from "@/lib/product-status";
import { getUniqueTeacherCode } from "@/lib/teacher-code";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ActionResult {
  success: boolean;
  message: string;
}

interface CreateProductInput {
  teacherId: string;
  name: string;
  type: ProductType;
  price: number;
  imageUrls: string[];
  tags: string[];
  stockQuantity?: number; // 只用於現貨
  preorderStartsAt?: string | null; // 只用於預購
  preorderEndsAt?: string | null; // 只用於預購
}

function revalidateProductPaths(type: ProductType) {
  revalidatePath(type === "preorder" ? "/admin/preorder-products" : "/admin/instock-products");
  revalidatePath(type === "preorder" ? "/preorder" : "/instock");
  revalidatePath("/admin/archived-products");
}

// 商品可上傳多張圖片，第一張快取到 products.image_url 做為列表主圖。
// 採「整批覆蓋」策略：先刪除這個商品現有的 product_images，再依序重新寫入，
// 比逐張比對新增/刪除簡單很多，商品圖片數量不多，效能上沒有問題。
async function replaceProductImages(
  supabase: SupabaseClient,
  productId: string,
  imageUrls: string[]
) {
  await supabase.from("product_images").delete().eq("product_id", productId);
  if (imageUrls.length > 0) {
    await supabase.from("product_images").insert(
      imageUrls.map((url, index) => ({
        product_id: productId,
        image_url: url,
        sort_order: index,
      }))
    );
  }
}

// 商品必須新增在老師底下，因此 teacherId 為必填。
export async function createProduct(input: CreateProductInput): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };
  if (!input.teacherId) return { success: false, message: "商品必須選擇所屬老師" };
  if (!input.name.trim()) return { success: false, message: "請輸入商品名稱" };

  const payload: Record<string, unknown> = {
    teacher_id: input.teacherId,
    name: input.name.trim(),
    type: input.type,
    price: input.price,
    image_url: input.imageUrls[0] ?? null,
    tags: input.tags,
  };

  if (input.type === "preorder") {
    // 預購沒有庫存，新商品一律從「預購中」開始。
    payload.arrival_status = "preordering";
    payload.stock_quantity = null;
    payload.preorder_starts_at = input.preorderStartsAt || null;
    payload.preorder_ends_at = input.preorderEndsAt || null;
  } else {
    const stock = input.stockQuantity ?? 0;
    payload.stock_quantity = stock;
    payload.is_sold_out = stock <= 0;
    payload.arrival_status = null;
  }

  const { data: product, error } = await supabase
    .from("products")
    .insert(payload)
    .select("id")
    .single();
  if (error || !product) return { success: false, message: error?.message ?? "新增商品失敗" };

  await replaceProductImages(supabase, product.id, input.imageUrls);

  revalidateProductPaths(input.type);
  return { success: true, message: "已新增商品" };
}

export interface BatchProductItemInput {
  name: string;
  price: number;
  imageUrls: string[];
  tags: string[];
  stockQuantity?: number; // 只用於現貨
  preorderStartsAt?: string | null; // 只用於預購
  preorderEndsAt?: string | null; // 只用於預購
}

export interface BatchCreateResult extends ActionResult {
  createdCount?: number;
  teacherCode?: string;
}

// 批量上架：一次在同一位老師底下建立多個商品品項。
// 老師名稱用「完全相同名稱」比對：找得到就掛在既有老師底下，找不到就自動建立新老師，
// 不需要後台管理員先手動跑一趟「老師管理」才能開始上架商品。
export async function createProductsBatch(
  teacherName: string,
  type: ProductType,
  items: BatchProductItemInput[]
): Promise<BatchCreateResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const trimmedTeacherName = teacherName.trim();
  if (!trimmedTeacherName) return { success: false, message: "請輸入老師名稱" };

  const validItems = items.filter((i) => i.name.trim());
  if (validItems.length === 0) return { success: false, message: "請至少輸入一個商品名稱" };

  const { data: existingTeacher } = await supabase
    .from("teachers")
    .select("id, teacher_code")
    .eq("name", trimmedTeacherName)
    .maybeSingle();

  let teacherId: string;
  let teacherCode: string;

  if (existingTeacher) {
    teacherId = existingTeacher.id;
    teacherCode = existingTeacher.teacher_code;
  } else {
    const { data: topTeacher } = await supabase
      .from("teachers")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const code = await getUniqueTeacherCode(supabase);
    const { data: newTeacher, error: teacherError } = await supabase
      .from("teachers")
      .insert({
        teacher_code: code,
        name: trimmedTeacherName,
        sort_order: (topTeacher?.sort_order ?? 0) + 1,
        is_active: true,
      })
      .select("id, teacher_code")
      .single();

    if (teacherError || !newTeacher) {
      return { success: false, message: teacherError?.message ?? `建立老師「${trimmedTeacherName}」失敗` };
    }
    teacherId = newTeacher.id;
    teacherCode = newTeacher.teacher_code;
  }

  let createdCount = 0;
  const failedNames: string[] = [];

  for (const item of validItems) {
    const payload: Record<string, unknown> = {
      teacher_id: teacherId,
      name: item.name.trim(),
      type,
      price: item.price,
      image_url: item.imageUrls[0] ?? null,
      tags: item.tags,
    };

    if (type === "preorder") {
      payload.arrival_status = "preordering";
      payload.stock_quantity = null;
      payload.preorder_starts_at = item.preorderStartsAt || null;
      payload.preorder_ends_at = item.preorderEndsAt || null;
    } else {
      const stock = item.stockQuantity ?? 0;
      payload.stock_quantity = stock;
      payload.is_sold_out = stock <= 0;
      payload.arrival_status = null;
    }

    const { data: product, error } = await supabase
      .from("products")
      .insert(payload)
      .select("id")
      .single();

    if (error || !product) {
      failedNames.push(item.name.trim());
      continue;
    }

    await replaceProductImages(supabase, product.id, item.imageUrls);
    createdCount++;
  }

  revalidateProductPaths(type);

  if (createdCount === 0) {
    return { success: false, message: "商品建立失敗，請確認欄位是否正確", teacherCode };
  }

  const failedNote = failedNames.length > 0 ? `，失敗品項：${failedNames.join("、")}` : "";
  return {
    success: true,
    message: `已在「${trimmedTeacherName}」（Teacher ID：${teacherCode}）底下建立 ${createdCount} 個商品品項${failedNote}`,
    createdCount,
    teacherCode,
  };
}

interface UpdateProductInput {
  name: string;
  price: number;
  imageUrls: string[];
  tags: string[];
  preorderStartsAt?: string | null;
  preorderEndsAt?: string | null;
}

export async function updateProduct(
  productId: string,
  type: ProductType,
  input: UpdateProductInput
): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };
  if (!input.name.trim()) return { success: false, message: "請輸入商品名稱" };

  const payload: Record<string, unknown> = {
    name: input.name.trim(),
    price: input.price,
    image_url: input.imageUrls[0] ?? null,
    tags: input.tags,
  };

  if (type === "preorder") {
    payload.preorder_starts_at = input.preorderStartsAt || null;
    payload.preorder_ends_at = input.preorderEndsAt || null;
  }

  const { error } = await supabase.from("products").update(payload).eq("id", productId);
  if (error) return { success: false, message: error.message };

  await replaceProductImages(supabase, productId, input.imageUrls);

  revalidateProductPaths(type);
  return { success: true, message: "已更新商品" };
}

// 快速複製一個商品，方便再修改名稱、價格、庫存或狀態，不需要每次重新填一次完整表單。
// 只複製單一商品，不會連同老師一起複製。
export async function duplicateProduct(productId: string): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { data: source, error: fetchError } = await supabase
    .from("products")
    .select(
      "teacher_id, name, type, price, image_url, arrival_status, stock_quantity, is_sold_out, tags, preorder_starts_at, preorder_ends_at"
    )
    .eq("id", productId)
    .maybeSingle();

  if (fetchError || !source) {
    return { success: false, message: fetchError?.message ?? "找不到來源商品" };
  }

  const { data: sourceImages } = await supabase
    .from("product_images")
    .select("image_url, sort_order")
    .eq("product_id", productId)
    .order("sort_order", { ascending: true });

  const { data: newProduct, error } = await supabase
    .from("products")
    .insert({
      teacher_id: source.teacher_id,
      name: `${source.name}（複製）`,
      type: source.type,
      price: source.price,
      image_url: source.image_url,
      arrival_status: source.type === "preorder" ? "preordering" : null,
      stock_quantity: source.type === "instock" ? source.stock_quantity : null,
      is_sold_out: source.type === "instock" ? source.is_sold_out : false,
      tags: source.tags,
      preorder_starts_at: source.type === "preorder" ? source.preorder_starts_at : null,
      preorder_ends_at: source.type === "preorder" ? source.preorder_ends_at : null,
    })
    .select("id")
    .single();

  if (error || !newProduct) return { success: false, message: error?.message ?? "複製商品失敗" };

  if (sourceImages && sourceImages.length > 0) {
    await supabase.from("product_images").insert(
      sourceImages.map((img) => ({
        product_id: newProduct.id,
        image_url: img.image_url,
        sort_order: img.sort_order,
      }))
    );
  }

  revalidateProductPaths(source.type as ProductType);
  return { success: true, message: "已複製商品，請修改名稱、價格、庫存或狀態" };
}

export async function setArrivalStatus(
  productId: string,
  status: ArrivalStatus
): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { error } = await supabase
    .from("products")
    .update({ arrival_status: status })
    .eq("id", productId);

  if (error) return { success: false, message: error.message };

  // 商品狀態改變時，同步更新這個商品尚未合併出貨的 shipment_items：
  // 「已到台／整理中／已開賣貨便」視為已到貨（可合併出貨），
  // 「預購中／未到貨」視為未到貨；已經合併進出貨批次的品項不受影響。
  const eligibleForShipping: ArrivalStatus[] = ["arrived", "packing", "listed"];
  const shipmentItemStatus = eligibleForShipping.includes(status) ? "arrived" : "not_arrived";

  const { data: relatedOrderItems } = await supabase
    .from("order_items")
    .select("id")
    .eq("product_id", productId);

  const orderItemIds = (relatedOrderItems ?? []).map((oi) => oi.id);
  if (orderItemIds.length > 0) {
    await supabase
      .from("shipment_items")
      .update({
        status: shipmentItemStatus,
        updated_at: new Date().toISOString(),
      })
      .in("order_item_id", orderItemIds)
      .is("shipment_id", null);
  }

  revalidatePath("/admin/preorder-products");
  revalidatePath("/admin/preorder-orders");
  revalidatePath("/preorder");
  return {
    success: true,
    message: `已標記為「${PREORDER_STATUS_LABEL[status]}」`,
  };
}

export async function updateStock(
  productId: string,
  stockQuantity: number
): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { error } = await supabase
    .from("products")
    .update({
      stock_quantity: stockQuantity,
      is_sold_out: stockQuantity <= 0,
    })
    .eq("id", productId);

  if (error) return { success: false, message: error.message };

  revalidatePath("/admin/instock-products");
  revalidatePath("/instock");
  return { success: true, message: "庫存已更新" };
}

// 同一位老師底下的商品拖曳排序後，依照拖曳後的順序重新寫入 sort_order。
export async function reorderProducts(
  type: ProductType,
  orderedProductIds: string[]
): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  await Promise.all(
    orderedProductIds.map((id, index) =>
      supabase.from("products").update({ sort_order: index }).eq("id", id)
    )
  );

  revalidateProductPaths(type);
  return { success: true, message: "排序已更新" };
}

// 商品不會真的刪除，改為封存：前台完全不顯示，後台一般清單也不顯示，
// 但可以在「已封存商品」頁面找回並恢復。
export async function archiveProduct(productId: string, type: ProductType): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { error } = await supabase
    .from("products")
    .update({ is_archived: true })
    .eq("id", productId);

  if (error) return { success: false, message: error.message };

  revalidateProductPaths(type);
  return { success: true, message: "已封存商品" };
}

export async function restoreProduct(productId: string, type: ProductType): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { error } = await supabase
    .from("products")
    .update({ is_archived: false })
    .eq("id", productId);

  if (error) return { success: false, message: error.message };

  revalidateProductPaths(type);
  return { success: true, message: "已恢復商品" };
}

const PRODUCT_HAS_UNFINISHED_ORDERS_MESSAGE = "此商品仍有未完成訂單，無法刪除。";

// 商品可以永久刪除的條件：完全沒有訂單紀錄，或相關的預購/現貨訂單全部都已完成。
// 只要有任何一筆相關訂單還在流程中，就不可刪除，避免刪掉還在處理中的訂單所依賴的商品資料。
async function getProductDeleteBlockReason(
  supabase: SupabaseClient,
  productId: string
): Promise<string | null> {
  const { data: orderItems } = await supabase
    .from("order_items")
    .select("id, order_id")
    .eq("product_id", productId);

  if (!orderItems || orderItems.length === 0) return null;

  const orderIds = Array.from(new Set(orderItems.map((oi) => oi.order_id)));
  const orderItemIds = orderItems.map((oi) => oi.id);

  const [{ data: orders }, { data: shipmentItems }] = await Promise.all([
    supabase.from("orders").select("id, order_type, status").in("id", orderIds),
    supabase.from("shipment_items").select("order_item_id, status").in("order_item_id", orderItemIds),
  ]);

  const orderMap = new Map((orders ?? []).map((o) => [o.id, o]));
  const shipmentStatusByOrderItemId = new Map((shipmentItems ?? []).map((s) => [s.order_item_id, s.status]));

  for (const oi of orderItems) {
    const order = orderMap.get(oi.order_id);
    if (!order) continue;

    if (order.order_type === "preorder") {
      const status = shipmentStatusByOrderItemId.get(oi.id);
      if (status !== "completed") return PRODUCT_HAS_UNFINISHED_ORDERS_MESSAGE;
    } else {
      if (order.status !== "completed") return PRODUCT_HAS_UNFINISHED_ORDERS_MESSAGE;
    }
  }

  return null;
}

// 永久刪除商品。相關 order_items 的 product_id 設計為 on delete set null，
// 商品名稱／老師名稱／價格都已經快照存在 order_items 上，刪除商品不會影響歷史訂單顯示。
export async function permanentlyDeleteProduct(productId: string, type: ProductType): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const blockReason = await getProductDeleteBlockReason(supabase, productId);
  if (blockReason) return { success: false, message: blockReason };

  const { error } = await supabase.from("products").delete().eq("id", productId);
  if (error) return { success: false, message: error.message };

  revalidateProductPaths(type);
  return { success: true, message: "已永久刪除商品" };
}

// 條件選品設定（例如「盲抽」買滿 5 抽可選 1 張保底）：設定在條件商品本身，
// bonusPoolProductIds 是這個條件商品可以挑選的保底/贈品商品清單，整批覆蓋寫入。
export async function setProductBonusConfig(
  productId: string,
  type: ProductType,
  input: {
    enabled: boolean;
    thresholdQty: number | null;
    pickQty: number | null;
    poolProductIds: string[];
  }
): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  if (input.enabled) {
    if (!input.thresholdQty || input.thresholdQty <= 0) {
      return { success: false, message: "請輸入達成數量" };
    }
    if (!input.pickQty || input.pickQty <= 0) {
      return { success: false, message: "請輸入可選數量" };
    }
    if (input.poolProductIds.length === 0) {
      return { success: false, message: "請至少選擇一個可選商品" };
    }
  }

  const { error } = await supabase
    .from("products")
    .update({
      bonus_enabled: input.enabled,
      bonus_threshold_qty: input.enabled ? input.thresholdQty : null,
      bonus_pick_qty: input.enabled ? input.pickQty : null,
    })
    .eq("id", productId);

  if (error) return { success: false, message: error.message };

  await supabase.from("product_bonus_items").delete().eq("condition_product_id", productId);
  if (input.enabled && input.poolProductIds.length > 0) {
    const { error: poolError } = await supabase.from("product_bonus_items").insert(
      input.poolProductIds.map((bonusProductId) => ({
        condition_product_id: productId,
        bonus_product_id: bonusProductId,
      }))
    );
    if (poolError) return { success: false, message: poolError.message };
  }

  revalidateProductPaths(type);
  return { success: true, message: "已更新條件選品設定" };
}
