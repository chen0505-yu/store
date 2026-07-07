import { getSupabaseServerClient } from "@/lib/supabase/server";

export interface AdminInstockVariant {
  id: string;
  name: string;
  stockQuantity: number;
  isSoldOut: boolean;
  sortOrder: number;
  isActive: boolean;
  isBonusOption: boolean;
}

export interface AdminInstockGroup {
  id: string;
  teacherId: string;
  name: string;
  price: number;
  imageUrl: string | null;
  images: string[];
  tags: string[];
  sortOrder: number;
  isArchived: boolean;
  isBlindDraw: boolean;
  blindDrawThresholdQty: number | null;
  blindDrawPickQty: number | null;
  isCpSpoiler: boolean;
  variants: AdminInstockVariant[];
}

export interface AdminInstockShop {
  teacherId: string;
  teacherCode: string;
  teacherName: string;
  avatarUrl: string | null;
  images: string[]; // 老師賣場封面圖，跟預購賣場共用同一組 teacher_images
  groups: AdminInstockGroup[];
}

// 後台老師現貨賣場管理：只列出「有現貨品項」的老師（品項/細項架構），
// 純預購用的老師（沒有任何 instock_product_groups）不會出現在這裡。
export async function getAdminInstockShops(): Promise<AdminInstockShop[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const { data: groups, error } = await supabase
    .from("instock_product_groups")
    .select(
      "id, teacher_id, name, price, image_url, tags, sort_order, is_archived, is_blind_draw, blind_draw_threshold_qty, blind_draw_pick_qty, is_cp_spoiler"
    )
    .eq("is_archived", false)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[LITAN] 讀取老師現貨賣場品項失敗", error.message);
    return [];
  }

  const groupRows = groups ?? [];
  if (groupRows.length === 0) return [];

  const teacherIds = Array.from(new Set(groupRows.map((g) => g.teacher_id)));
  const groupIds = groupRows.map((g) => g.id);

  const [{ data: teachers }, { data: variants }, { data: groupImages }, { data: teacherImages }] =
    await Promise.all([
      supabase.from("teachers").select("id, teacher_code, name, avatar_url").in("id", teacherIds),
      supabase
        .from("instock_product_variants")
        .select(
          "id, instock_product_group_id, name, stock_quantity, is_sold_out, sort_order, is_active, is_bonus_option"
        )
        .in("instock_product_group_id", groupIds)
        .order("sort_order", { ascending: true }),
      supabase
        .from("instock_product_group_images")
        .select("instock_product_group_id, image_url, sort_order")
        .in("instock_product_group_id", groupIds)
        .order("sort_order", { ascending: true }),
      supabase
        .from("teacher_images")
        .select("teacher_id, image_url, sort_order")
        .in("teacher_id", teacherIds)
        .order("sort_order", { ascending: true }),
    ]);

  const teacherMap = new Map((teachers ?? []).map((t) => [t.id, t]));

  const variantsByGroup = new Map<string, AdminInstockVariant[]>();
  for (const v of variants ?? []) {
    const list = variantsByGroup.get(v.instock_product_group_id) ?? [];
    list.push({
      id: v.id,
      name: v.name,
      stockQuantity: v.stock_quantity,
      isSoldOut: v.is_sold_out,
      sortOrder: v.sort_order,
      isActive: v.is_active,
      isBonusOption: v.is_bonus_option,
    });
    variantsByGroup.set(v.instock_product_group_id, list);
  }

  const imagesByGroup = new Map<string, string[]>();
  for (const img of groupImages ?? []) {
    const list = imagesByGroup.get(img.instock_product_group_id) ?? [];
    list.push(img.image_url);
    imagesByGroup.set(img.instock_product_group_id, list);
  }

  const imagesByTeacher = new Map<string, string[]>();
  for (const img of teacherImages ?? []) {
    const list = imagesByTeacher.get(img.teacher_id) ?? [];
    list.push(img.image_url);
    imagesByTeacher.set(img.teacher_id, list);
  }

  const shopsByTeacher = new Map<string, AdminInstockShop>();
  for (const g of groupRows) {
    const teacher = teacherMap.get(g.teacher_id);
    if (!teacher) continue;

    let shop = shopsByTeacher.get(g.teacher_id);
    if (!shop) {
      shop = {
        teacherId: teacher.id,
        teacherCode: teacher.teacher_code,
        teacherName: teacher.name,
        avatarUrl: teacher.avatar_url,
        images: imagesByTeacher.get(teacher.id) ?? [],
        groups: [],
      };
      shopsByTeacher.set(g.teacher_id, shop);
    }

    shop.groups.push({
      id: g.id,
      teacherId: g.teacher_id,
      name: g.name,
      price: Number(g.price),
      imageUrl: g.image_url,
      images: imagesByGroup.get(g.id) ?? [],
      tags: g.tags ?? [],
      sortOrder: g.sort_order,
      isArchived: g.is_archived,
      isBlindDraw: g.is_blind_draw,
      blindDrawThresholdQty: g.blind_draw_threshold_qty,
      blindDrawPickQty: g.blind_draw_pick_qty,
      isCpSpoiler: g.is_cp_spoiler,
      variants: variantsByGroup.get(g.id) ?? [],
    });
  }

  return Array.from(shopsByTeacher.values()).sort((a, b) =>
    a.teacherName.localeCompare(b.teacherName, "zh-Hant")
  );
}
