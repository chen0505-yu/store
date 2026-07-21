import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { ArrivalStatus } from "@/lib/types";

export interface ArtistShopVariant {
  id: string;
  name: string;
  isBonusOption: boolean;
}

export interface ArtistShopGroup {
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
  variants: ArtistShopVariant[];
}

export interface ArtistShopFront {
  teacherId: string;
  teacherCode: string;
  teacherName: string;
  avatarUrl: string | null;
  images: string[];
  socialUrl: string | null;
  preorderStartsAt: string | null;
  preorderEndsAt: string | null;
  remittanceStartsAt: string | null;
  remittanceEndsAt: string | null;
  bankName: string | null;
  bankCode: string | null;
  accountName: string | null;
  accountNumber: string | null;
  remittanceNote: string | null;
  marketplaceNote: string | null;
  groups: ArtistShopGroup[];
}

// 繪師賣場前台頁：結構跟 teacher-shop.ts 的 getTeacherShop 完全對應（老師/品項/細項），
// 差別只在讀的是 artist_product_groups/artist_product_variants，並且多帶出匯款規則欄位
// （前台要依 remittance_starts_at/ends_at 顯示「尚未開放匯款」/匯款表單/「匯款期限已截止」）。
export async function getArtistShop(teacherId: string): Promise<ArtistShopFront | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const [{ data: teacher }, { data: images }] = await Promise.all([
    supabase
      .from("teachers")
      .select(
        "id, teacher_code, name, avatar_url, social_url, preorder_starts_at, preorder_ends_at, remittance_starts_at, remittance_ends_at, bank_name, bank_code, account_name, account_number, remittance_note, marketplace_note"
      )
      .eq("id", teacherId)
      .eq("is_active", true)
      .eq("is_artist_shop", true)
      .maybeSingle(),
    supabase.from("teacher_images").select("image_url").eq("teacher_id", teacherId).order("sort_order", { ascending: true }),
  ]);

  if (!teacher) return null;

  const { data: groups, error } = await supabase
    .from("artist_product_groups")
    .select(
      "id, name, price, image_url, arrival_status, is_blind_draw, blind_draw_threshold_qty, blind_draw_pick_qty, is_cp_spoiler"
    )
    .eq("teacher_id", teacherId)
    .eq("is_archived", false)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[LITAN] 讀取繪師賣場失敗", error.message);
    return null;
  }

  const groupRows = groups ?? [];
  const groupIds = groupRows.map((g) => g.id);

  const [{ data: variants }, { data: groupImages }] = await Promise.all([
    groupIds.length > 0
      ? supabase
          .from("artist_product_variants")
          .select("id, artist_product_group_id, name, is_bonus_option")
          .in("artist_product_group_id", groupIds)
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
      : Promise.resolve({ data: [] }),
    groupIds.length > 0
      ? supabase
          .from("artist_product_group_images")
          .select("artist_product_group_id, image_url, sort_order")
          .in("artist_product_group_id", groupIds)
          .order("sort_order", { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);

  const variantsByGroup = new Map<string, ArtistShopVariant[]>();
  for (const v of variants ?? []) {
    const list = variantsByGroup.get(v.artist_product_group_id) ?? [];
    list.push({ id: v.id, name: v.name, isBonusOption: v.is_bonus_option });
    variantsByGroup.set(v.artist_product_group_id, list);
  }

  const imagesByGroup = new Map<string, string[]>();
  for (const img of groupImages ?? []) {
    const list = imagesByGroup.get(img.artist_product_group_id) ?? [];
    list.push(img.image_url);
    imagesByGroup.set(img.artist_product_group_id, list);
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
    remittanceStartsAt: teacher.remittance_starts_at,
    remittanceEndsAt: teacher.remittance_ends_at,
    bankName: teacher.bank_name,
    bankCode: teacher.bank_code,
    accountName: teacher.account_name,
    accountNumber: teacher.account_number,
    remittanceNote: teacher.remittance_note,
    marketplaceNote: teacher.marketplace_note,
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

export interface ArtistTeacherSummary {
  teacherId: string;
  teacherName: string;
  avatarUrl: string | null;
  coverImage: string | null;
  groupCount: number;
  searchText: string;
}

// 繪師預購專區列表：只列出啟用中、is_artist_shop=true、且有預購品項的繪師。
export async function getArtistTeacherSummaries(): Promise<ArtistTeacherSummary[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const { data: groups, error } = await supabase
    .from("artist_product_groups")
    .select("id, teacher_id, name")
    .eq("is_archived", false);

  if (error) {
    console.error("[LITAN] 讀取繪師清單失敗", error.message);
    return [];
  }

  const groupRows = groups ?? [];
  if (groupRows.length === 0) return [];

  const countByTeacher = new Map<string, number>();
  const searchPartsByTeacher = new Map<string, string[]>();
  for (const g of groupRows) {
    countByTeacher.set(g.teacher_id, (countByTeacher.get(g.teacher_id) ?? 0) + 1);
    const parts = searchPartsByTeacher.get(g.teacher_id) ?? [];
    parts.push(g.name);
    searchPartsByTeacher.set(g.teacher_id, parts);
  }

  const teacherIds = Array.from(countByTeacher.keys());
  const groupIds = groupRows.map((g) => g.id);
  // 到達 preorder_ends_at 後，賣場自動不在前台列表顯示（既有訂單資料不受影響）。
  const nowISO = new Date().toISOString();
  const [{ data: teachers }, { data: images }, { data: variants }] = await Promise.all([
    supabase
      .from("teachers")
      .select("id, name, avatar_url")
      .in("id", teacherIds)
      .eq("is_active", true)
      .eq("is_artist_shop", true)
      .or(`preorder_ends_at.is.null,preorder_ends_at.gte.${nowISO}`),
    supabase
      .from("teacher_images")
      .select("teacher_id, image_url, sort_order")
      .in("teacher_id", teacherIds)
      .order("sort_order", { ascending: true }),
    supabase.from("artist_product_variants").select("artist_product_group_id, name").in("artist_product_group_id", groupIds),
  ]);

  const teacherIdByGroupId = new Map(groupRows.map((g) => [g.id, g.teacher_id]));
  for (const v of variants ?? []) {
    const teacherId = teacherIdByGroupId.get(v.artist_product_group_id);
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

export interface ArtistOrderShopInfo {
  teacherName: string;
  remittanceStartsAt: string | null;
  remittanceEndsAt: string | null;
  bankName: string | null;
  bankCode: string | null;
  accountName: string | null;
  accountNumber: string | null;
  remittanceNote: string | null;
}

// 會員中心「我的繪師預購訂單」頁用：每張訂單都要顯示它所屬繪師「當下」的匯款規則與帳戶
// （不是全站共用的一組帳戶），透過 order_items.artist_group_id 反查回 teacher_id 再讀
// teachers 上的匯款欄位。繪師被停用後，帳戶資訊仍可正常查到（不影響歷史訂單顯示）。
export async function getArtistOrderShopInfoMap(orderIds: string[]): Promise<Map<string, ArtistOrderShopInfo>> {
  const supabase = getSupabaseServerClient();
  const map = new Map<string, ArtistOrderShopInfo>();
  if (!supabase || orderIds.length === 0) return map;

  const { data: orderItems } = await supabase
    .from("order_items")
    .select("order_id, artist_group_id")
    .in("order_id", orderIds)
    .not("artist_group_id", "is", null);

  const groupIdByOrderId = new Map<string, string>();
  for (const oi of orderItems ?? []) {
    if (oi.artist_group_id && !groupIdByOrderId.has(oi.order_id)) {
      groupIdByOrderId.set(oi.order_id, oi.artist_group_id);
    }
  }

  const groupIds = Array.from(new Set(groupIdByOrderId.values()));
  if (groupIds.length === 0) return map;

  const { data: groups } = await supabase.from("artist_product_groups").select("id, teacher_id").in("id", groupIds);
  const teacherIdByGroupId = new Map((groups ?? []).map((g) => [g.id, g.teacher_id]));

  const teacherIds = Array.from(new Set(Array.from(teacherIdByGroupId.values())));
  const { data: teachers } = await supabase
    .from("teachers")
    .select(
      "id, name, remittance_starts_at, remittance_ends_at, bank_name, bank_code, account_name, account_number, remittance_note"
    )
    .in("id", teacherIds);
  const teacherById = new Map((teachers ?? []).map((t) => [t.id, t]));

  for (const [orderId, groupId] of groupIdByOrderId) {
    const teacherId = teacherIdByGroupId.get(groupId);
    const teacher = teacherId ? teacherById.get(teacherId) : undefined;
    if (!teacher) continue;
    map.set(orderId, {
      teacherName: teacher.name,
      remittanceStartsAt: teacher.remittance_starts_at,
      remittanceEndsAt: teacher.remittance_ends_at,
      bankName: teacher.bank_name,
      bankCode: teacher.bank_code,
      accountName: teacher.account_name,
      accountNumber: teacher.account_number,
      remittanceNote: teacher.remittance_note,
    });
  }

  return map;
}
