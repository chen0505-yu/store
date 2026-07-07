import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ArrivalStatus, ProductType } from "@/lib/types";

export interface AdminProduct {
  id: string;
  teacherId: string;
  teacherName: string;
  teacherCode: string;
  name: string;
  type: ProductType;
  price: number;
  imageUrl: string | null;
  images: string[];
  arrivalStatus: ArrivalStatus | null;
  stockQuantity: number | null;
  isSoldOut: boolean;
  tags: string[];
  sortOrder: number;
  preorderStartsAt: string | null;
  preorderEndsAt: string | null;
  isArchived: boolean;
  bonusEnabled: boolean;
  bonusThresholdQty: number | null;
  bonusPickQty: number | null;
  bonusPoolProductIds: string[];
}

interface ProductRow {
  id: string;
  teacher_id: string | null;
  name: string;
  type: ProductType;
  price: number;
  image_url: string | null;
  arrival_status: ArrivalStatus | null;
  stock_quantity: number | null;
  is_sold_out: boolean;
  tags: string[] | null;
  sort_order: number;
  preorder_starts_at: string | null;
  preorder_ends_at: string | null;
  is_archived: boolean;
}

interface BonusFields {
  bonusEnabled: boolean;
  bonusThresholdQty: number | null;
  bonusPickQty: number | null;
}

interface TeacherLookupRow {
  id: string;
  name: string;
  teacher_code: string;
}

const PRODUCT_COLUMNS =
  "id, teacher_id, name, type, price, image_url, arrival_status, stock_quantity, is_sold_out, tags, sort_order, preorder_starts_at, preorder_ends_at, is_archived";

async function getImagesByProductId(
  supabase: SupabaseClient,
  productIds: string[]
): Promise<Map<string, string[]>> {
  if (productIds.length === 0) return new Map();

  const { data: images } = await supabase
    .from("product_images")
    .select("product_id, image_url, sort_order")
    .in("product_id", productIds)
    .order("sort_order", { ascending: true });

  const map = new Map<string, string[]>();
  for (const img of images ?? []) {
    const list = map.get(img.product_id) ?? [];
    list.push(img.image_url);
    map.set(img.product_id, list);
  }
  return map;
}

// 條件選品（bonus_enabled 等欄位、product_bonus_items 資料表）這幾支查詢獨立於商品主查詢，
// 就算對應的 migration（012）還沒在這個 Supabase 專案執行，也只會讓「條件選品」的資料是空的，
// 不會讓整個商品列表因為 select 到不存在的欄位而整批查詢失敗、後台顯示「尚無商品」。
async function getBonusFieldsByProductId(
  supabase: SupabaseClient,
  productIds: string[]
): Promise<Map<string, BonusFields>> {
  if (productIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("products")
    .select("id, bonus_enabled, bonus_threshold_qty, bonus_pick_qty")
    .in("id", productIds);

  if (error) return new Map();

  return new Map(
    (data ?? []).map((row) => [
      row.id as string,
      {
        bonusEnabled: Boolean(row.bonus_enabled),
        bonusThresholdQty: row.bonus_threshold_qty,
        bonusPickQty: row.bonus_pick_qty,
      },
    ])
  );
}

async function getBonusPoolByProductId(
  supabase: SupabaseClient,
  productIds: string[]
): Promise<Map<string, string[]>> {
  if (productIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("product_bonus_items")
    .select("condition_product_id, bonus_product_id")
    .in("condition_product_id", productIds);

  if (error) return new Map();

  const map = new Map<string, string[]>();
  for (const item of data ?? []) {
    const list = map.get(item.condition_product_id) ?? [];
    list.push(item.bonus_product_id);
    map.set(item.condition_product_id, list);
  }
  return map;
}

function mapProductRow(
  row: ProductRow,
  teacherMap: Map<string, TeacherLookupRow>,
  imagesMap: Map<string, string[]>,
  bonusFieldsMap: Map<string, BonusFields>,
  bonusPoolMap: Map<string, string[]>
): AdminProduct {
  const teacher = row.teacher_id ? teacherMap.get(row.teacher_id) : undefined;
  const bonusFields = bonusFieldsMap.get(row.id);
  return {
    id: row.id,
    teacherId: row.teacher_id ?? "",
    teacherName: teacher?.name ?? "未指定老師",
    teacherCode: teacher?.teacher_code ?? "-",
    name: row.name,
    type: row.type,
    price: Number(row.price),
    imageUrl: row.image_url,
    images: imagesMap.get(row.id) ?? [],
    arrivalStatus: row.arrival_status,
    stockQuantity: row.stock_quantity,
    isSoldOut: row.is_sold_out,
    tags: row.tags ?? [],
    sortOrder: row.sort_order,
    preorderStartsAt: row.preorder_starts_at,
    preorderEndsAt: row.preorder_ends_at,
    isArchived: row.is_archived,
    bonusEnabled: bonusFields?.bonusEnabled ?? false,
    bonusThresholdQty: bonusFields?.bonusThresholdQty ?? null,
    bonusPickQty: bonusFields?.bonusPickQty ?? null,
    bonusPoolProductIds: bonusPoolMap.get(row.id) ?? [],
  };
}

// 商品改為老師底下管理：後台商品列表必須帶出所屬老師的名稱與 Teacher ID。
// 一般清單不顯示已封存商品，封存商品請見 getArchivedProducts。
export async function getAdminProducts(type: ProductType): Promise<AdminProduct[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const [{ data: products, error }, { data: teachers }] = await Promise.all([
    supabase
      .from("products")
      .select(PRODUCT_COLUMNS)
      .eq("type", type)
      .eq("is_archived", false)
      .order("sort_order", { ascending: true }),
    supabase.from("teachers").select("id, name, teacher_code"),
  ]);

  if (error) {
    console.error("[LITAN] 讀取商品失敗", error.message);
    return [];
  }

  const rows = (products ?? []) as ProductRow[];
  const teacherMap = new Map<string, TeacherLookupRow>(
    ((teachers ?? []) as TeacherLookupRow[]).map((t) => [t.id, t])
  );
  const [imagesMap, bonusFieldsMap, bonusPoolMap] = await Promise.all([
    getImagesByProductId(supabase, rows.map((r) => r.id)),
    getBonusFieldsByProductId(supabase, rows.map((r) => r.id)),
    getBonusPoolByProductId(supabase, rows.map((r) => r.id)),
  ]);

  return rows.map((row) => mapProductRow(row, teacherMap, imagesMap, bonusFieldsMap, bonusPoolMap));
}

export async function getArchivedProducts(): Promise<AdminProduct[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const [{ data: products, error }, { data: teachers }] = await Promise.all([
    supabase
      .from("products")
      .select(PRODUCT_COLUMNS)
      .eq("is_archived", true)
      .order("created_at", { ascending: false }),
    supabase.from("teachers").select("id, name, teacher_code"),
  ]);

  if (error) {
    console.error("[LITAN] 讀取封存商品失敗", error.message);
    return [];
  }

  const rows = (products ?? []) as ProductRow[];
  const teacherMap = new Map<string, TeacherLookupRow>(
    ((teachers ?? []) as TeacherLookupRow[]).map((t) => [t.id, t])
  );
  const [imagesMap, bonusFieldsMap, bonusPoolMap] = await Promise.all([
    getImagesByProductId(supabase, rows.map((r) => r.id)),
    getBonusFieldsByProductId(supabase, rows.map((r) => r.id)),
    getBonusPoolByProductId(supabase, rows.map((r) => r.id)),
  ]);

  return rows.map((row) => mapProductRow(row, teacherMap, imagesMap, bonusFieldsMap, bonusPoolMap));
}
