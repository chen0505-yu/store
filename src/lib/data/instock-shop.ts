import { getSupabaseServerClient } from "@/lib/supabase/server";

export interface InstockShopVariant {
  id: string;
  name: string;
  stockQuantity: number;
  isSoldOut: boolean;
  isBonusOption: boolean;
}

export interface InstockShopGroup {
  id: string;
  name: string;
  price: number;
  imageUrl: string | null;
  images: string[];
  isBlindDraw: boolean;
  blindDrawThresholdQty: number | null;
  blindDrawPickQty: number | null;
  isCpSpoiler: boolean;
  variants: InstockShopVariant[];
}

export interface InstockShop {
  teacherId: string;
  teacherCode: string;
  teacherName: string;
  avatarUrl: string | null;
  images: string[]; // 老師賣場封面圖（老師層級），跟預購共用同一組 teacher_images
  socialUrl: string | null;
  groups: InstockShopGroup[];
}

// 老師現貨賣場頁：老師 → 品項 → 細項，細項庫存決定能不能加入購物車，跟預購賣場的時間窗無關。
export async function getInstockShop(teacherId: string): Promise<InstockShop | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const [{ data: teacher }, { data: images }] = await Promise.all([
    supabase
      .from("teachers")
      .select("id, teacher_code, name, avatar_url, social_url")
      .eq("id", teacherId)
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("teacher_images")
      .select("image_url")
      .eq("teacher_id", teacherId)
      .order("sort_order", { ascending: true }),
  ]);

  if (!teacher) return null;

  const { data: groups, error } = await supabase
    .from("instock_product_groups")
    .select(
      "id, name, price, image_url, is_blind_draw, blind_draw_threshold_qty, blind_draw_pick_qty, is_cp_spoiler"
    )
    .eq("teacher_id", teacherId)
    .eq("is_archived", false)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[LITAN] 讀取老師現貨賣場失敗", error.message);
    return null;
  }

  const groupRows = groups ?? [];
  const groupIds = groupRows.map((g) => g.id);

  const [{ data: variants }, { data: groupImages }] =
    groupIds.length > 0
      ? await Promise.all([
          supabase
            .from("instock_product_variants")
            .select("id, instock_product_group_id, name, stock_quantity, is_sold_out, is_bonus_option")
            .in("instock_product_group_id", groupIds)
            .eq("is_active", true)
            .order("sort_order", { ascending: true }),
          supabase
            .from("instock_product_group_images")
            .select("instock_product_group_id, image_url, sort_order")
            .in("instock_product_group_id", groupIds)
            .order("sort_order", { ascending: true }),
        ])
      : [{ data: [] }, { data: [] }];

  const variantsByGroup = new Map<string, InstockShopVariant[]>();
  for (const v of variants ?? []) {
    const list = variantsByGroup.get(v.instock_product_group_id) ?? [];
    list.push({
      id: v.id,
      name: v.name,
      stockQuantity: v.stock_quantity,
      isSoldOut: v.is_sold_out,
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

  return {
    teacherId: teacher.id,
    teacherCode: teacher.teacher_code,
    teacherName: teacher.name,
    avatarUrl: teacher.avatar_url,
    images: (images ?? []).map((i) => i.image_url),
    socialUrl: teacher.social_url,
    groups: groupRows.map((g) => ({
      id: g.id,
      name: g.name,
      price: Number(g.price),
      imageUrl: g.image_url,
      images: imagesByGroup.get(g.id) ?? [],
      isBlindDraw: g.is_blind_draw,
      blindDrawThresholdQty: g.blind_draw_threshold_qty,
      blindDrawPickQty: g.blind_draw_pick_qty,
      isCpSpoiler: g.is_cp_spoiler,
      variants: variantsByGroup.get(g.id) ?? [],
    })),
  };
}

export interface InstockTeacherSummary {
  teacherId: string;
  teacherName: string;
  avatarUrl: string | null;
  coverImage: string | null;
  groupCount: number;
}

// 現貨專區列表：只列出「有現貨品項」的老師，點進去就是老師現貨賣場頁。
export async function getInstockTeacherSummaries(): Promise<InstockTeacherSummary[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const { data: groups, error } = await supabase
    .from("instock_product_groups")
    .select("teacher_id")
    .eq("is_archived", false);

  if (error) {
    console.error("[LITAN] 讀取現貨老師清單失敗", error.message);
    return [];
  }

  const groupRows = groups ?? [];
  if (groupRows.length === 0) return [];

  const countByTeacher = new Map<string, number>();
  for (const g of groupRows) {
    countByTeacher.set(g.teacher_id, (countByTeacher.get(g.teacher_id) ?? 0) + 1);
  }

  const teacherIds = Array.from(countByTeacher.keys());
  const [{ data: teachers }, { data: images }] = await Promise.all([
    supabase.from("teachers").select("id, name, avatar_url").in("id", teacherIds).eq("is_active", true),
    supabase
      .from("teacher_images")
      .select("teacher_id, image_url, sort_order")
      .in("teacher_id", teacherIds)
      .order("sort_order", { ascending: true }),
  ]);

  const coverImageByTeacher = new Map<string, string>();
  for (const img of images ?? []) {
    if (!coverImageByTeacher.has(img.teacher_id)) {
      coverImageByTeacher.set(img.teacher_id, img.image_url);
    }
  }

  return (teachers ?? [])
    .map((t) => ({
      teacherId: t.id,
      teacherName: t.name,
      avatarUrl: t.avatar_url,
      coverImage: coverImageByTeacher.get(t.id) ?? t.avatar_url,
      groupCount: countByTeacher.get(t.id) ?? 0,
    }))
    .sort((a, b) => a.teacherName.localeCompare(b.teacherName, "zh-Hant"));
}
