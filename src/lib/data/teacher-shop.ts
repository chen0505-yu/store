import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { ArrivalStatus } from "@/lib/types";

export interface TeacherShopVariant {
  id: string;
  name: string;
  isBonusOption: boolean;
}

export interface TeacherShopGroup {
  id: string;
  name: string;
  price: number;
  imageUrl: string | null;
  images: string[];
  arrivalStatus: ArrivalStatus;
  isBlindDraw: boolean;
  blindDrawThresholdQty: number | null;
  blindDrawPickQty: number | null;
  isCpSpoiler: boolean;
  variants: TeacherShopVariant[];
}

export interface TeacherShop {
  teacherId: string;
  teacherCode: string;
  teacherName: string;
  avatarUrl: string | null;
  images: string[]; // 老師賣場封面圖（老師層級），第一張是卡片封面，沒有圖片時前台顯示預設狸貓圖
  socialUrl: string | null;
  preorderStartsAt: string | null;
  preorderEndsAt: string | null;
  groups: TeacherShopGroup[];
}

// 老師賣場頁：老師 → 品項 → 細項，整間賣場共用一個預購時間窗（見 teachers.preorder_starts_at/ends_at）。
export async function getTeacherShop(teacherId: string): Promise<TeacherShop | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const [{ data: teacher }, { data: images }] = await Promise.all([
    supabase
      .from("teachers")
      .select("id, teacher_code, name, avatar_url, social_url, preorder_starts_at, preorder_ends_at")
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
    .from("product_groups")
    .select(
      "id, name, price, image_url, arrival_status, is_blind_draw, blind_draw_threshold_qty, blind_draw_pick_qty, is_cp_spoiler"
    )
    .eq("teacher_id", teacherId)
    .eq("is_archived", false)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[LITAN] 讀取老師賣場失敗", error.message);
    return null;
  }

  const groupRows = groups ?? [];
  const groupIds = groupRows.map((g) => g.id);

  const [{ data: variants }, { data: groupImages }] = await Promise.all([
    groupIds.length > 0
      ? supabase
          .from("product_variants")
          .select("id, product_group_id, name, is_bonus_option")
          .in("product_group_id", groupIds)
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
      : Promise.resolve({ data: [] }),
    groupIds.length > 0
      ? supabase
          .from("product_group_images")
          .select("product_group_id, image_url, sort_order")
          .in("product_group_id", groupIds)
          .order("sort_order", { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);

  const variantsByGroup = new Map<string, TeacherShopVariant[]>();
  for (const v of variants ?? []) {
    const list = variantsByGroup.get(v.product_group_id) ?? [];
    list.push({ id: v.id, name: v.name, isBonusOption: v.is_bonus_option });
    variantsByGroup.set(v.product_group_id, list);
  }

  const imagesByGroup = new Map<string, string[]>();
  for (const img of groupImages ?? []) {
    const list = imagesByGroup.get(img.product_group_id) ?? [];
    list.push(img.image_url);
    imagesByGroup.set(img.product_group_id, list);
  }

  return {
    teacherId: teacher.id,
    teacherCode: teacher.teacher_code,
    teacherName: teacher.name,
    avatarUrl: teacher.avatar_url,
    images: (images ?? []).map((i) => i.image_url),
    socialUrl: teacher.social_url,
    preorderStartsAt: teacher.preorder_starts_at,
    preorderEndsAt: teacher.preorder_ends_at,
    groups: groupRows.map((g) => ({
      id: g.id,
      name: g.name,
      price: Number(g.price),
      imageUrl: g.image_url,
      images: imagesByGroup.get(g.id) ?? [],
      arrivalStatus: g.arrival_status,
      isBlindDraw: g.is_blind_draw,
      blindDrawThresholdQty: g.blind_draw_threshold_qty,
      blindDrawPickQty: g.blind_draw_pick_qty,
      isCpSpoiler: g.is_cp_spoiler,
      variants: variantsByGroup.get(g.id) ?? [],
    })),
  };
}

export interface PreorderTeacherSummary {
  teacherId: string;
  teacherName: string;
  avatarUrl: string | null;
  coverImage: string | null; // 老師賣場封面圖第一張，沒有才 fallback 到 avatarUrl，前台再 fallback 到預設狸貓圖
  groupCount: number;
  searchText: string; // 品項名稱／細項名稱／Tag 全部串起來（小寫），前台搜尋用，不會顯示出來
}

// 預購專區列表：只列出「有預購品項」的老師，點進去就是老師賣場頁。
// searchText 讓前台可以依老師名稱／品項名稱／細項名稱／Tag 搜尋，不用另外打 API。
export async function getPreorderTeacherSummaries(): Promise<PreorderTeacherSummary[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const { data: groups, error } = await supabase
    .from("product_groups")
    .select("id, teacher_id, name, tags")
    .eq("is_archived", false);

  if (error) {
    console.error("[LITAN] 讀取預購老師清單失敗", error.message);
    return [];
  }

  const groupRows = groups ?? [];
  if (groupRows.length === 0) return [];

  const countByTeacher = new Map<string, number>();
  const searchPartsByTeacher = new Map<string, string[]>();
  for (const g of groupRows) {
    countByTeacher.set(g.teacher_id, (countByTeacher.get(g.teacher_id) ?? 0) + 1);
    const parts = searchPartsByTeacher.get(g.teacher_id) ?? [];
    parts.push(g.name, ...(g.tags ?? []));
    searchPartsByTeacher.set(g.teacher_id, parts);
  }

  const teacherIds = Array.from(countByTeacher.keys());
  const groupIds = groupRows.map((g) => g.id);
  const [{ data: teachers }, { data: images }, { data: variants }] = await Promise.all([
    supabase.from("teachers").select("id, name, avatar_url").in("id", teacherIds).eq("is_active", true),
    supabase
      .from("teacher_images")
      .select("teacher_id, image_url, sort_order")
      .in("teacher_id", teacherIds)
      .order("sort_order", { ascending: true }),
    supabase.from("product_variants").select("product_group_id, name").in("product_group_id", groupIds),
  ]);

  const teacherIdByGroupId = new Map(groupRows.map((g) => [g.id, g.teacher_id]));
  for (const v of variants ?? []) {
    const teacherId = teacherIdByGroupId.get(v.product_group_id);
    if (!teacherId) continue;
    const parts = searchPartsByTeacher.get(teacherId) ?? [];
    parts.push(v.name);
    searchPartsByTeacher.set(teacherId, parts);
  }

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
      searchText: (searchPartsByTeacher.get(t.id) ?? []).join(" ").toLowerCase(),
    }))
    .sort((a, b) => a.teacherName.localeCompare(b.teacherName, "zh-Hant"));
}
