import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { ArrivalStatus } from "@/lib/types";

export interface ArtistVariant {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  isBonusOption: boolean;
  surchargeAmount: number | null;
  surchargeReason: string | null;
}

export interface ArtistProductGroup {
  id: string;
  teacherId: string;
  name: string;
  price: number;
  imageUrl: string | null;
  images: string[];
  tags: string[];
  sortOrder: number;
  arrivalStatus: ArrivalStatus;
  isArchived: boolean;
  isBlindDraw: boolean;
  blindDrawThresholdQty: number | null;
  blindDrawPickQty: number | null;
  isCpSpoiler: boolean;
  surchargeAmount: number | null;
  surchargeReason: string | null;
  variants: ArtistVariant[];
}

export interface ArtistShopSettings {
  teacherId: string;
  teacherCode: string;
  name: string;
  images: string[];
  isActive: boolean;
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
}

export async function getArtistShopSettings(teacherId: string): Promise<ArtistShopSettings | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const [{ data: teacher }, { data: images }] = await Promise.all([
    supabase
      .from("teachers")
      .select(
        "id, teacher_code, name, is_active, preorder_starts_at, preorder_ends_at, remittance_starts_at, remittance_ends_at, bank_name, bank_code, account_name, account_number, remittance_note, marketplace_note"
      )
      .eq("id", teacherId)
      .maybeSingle(),
    supabase.from("teacher_images").select("image_url, sort_order").eq("teacher_id", teacherId).order("sort_order", { ascending: true }),
  ]);

  if (!teacher) return null;

  return {
    teacherId: teacher.id,
    teacherCode: teacher.teacher_code,
    name: teacher.name,
    images: (images ?? []).map((i) => i.image_url),
    isActive: teacher.is_active,
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
  };
}

// 只查單一繪師底下的品項（跟後台葴葴預購那個「查全部老師」的 getAdminTeacherShops 不同，
// 繪師後台一次只看自己的商店，不需要聚合多位老師）。
export async function getArtistProductGroups(teacherId: string): Promise<ArtistProductGroup[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const { data: groups, error } = await supabase
    .from("artist_product_groups")
    .select(
      "id, teacher_id, name, price, image_url, tags, sort_order, arrival_status, is_archived, is_blind_draw, blind_draw_threshold_qty, blind_draw_pick_qty, is_cp_spoiler, surcharge_amount, surcharge_reason"
    )
    .eq("teacher_id", teacherId)
    .eq("is_archived", false)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[LITAN] 讀取繪師商品失敗", error.message);
    return [];
  }

  const groupRows = groups ?? [];
  if (groupRows.length === 0) return [];
  const groupIds = groupRows.map((g) => g.id);

  const [{ data: variants }, { data: groupImages }] = await Promise.all([
    supabase
      .from("artist_product_variants")
      .select(
        "id, artist_product_group_id, name, sort_order, is_active, is_bonus_option, surcharge_amount, surcharge_reason"
      )
      .in("artist_product_group_id", groupIds)
      .order("sort_order", { ascending: true }),
    supabase
      .from("artist_product_group_images")
      .select("artist_product_group_id, image_url, sort_order")
      .in("artist_product_group_id", groupIds)
      .order("sort_order", { ascending: true }),
  ]);

  const variantsByGroup = new Map<string, ArtistVariant[]>();
  for (const v of variants ?? []) {
    const list = variantsByGroup.get(v.artist_product_group_id) ?? [];
    list.push({
      id: v.id,
      name: v.name,
      sortOrder: v.sort_order,
      isActive: v.is_active,
      isBonusOption: v.is_bonus_option,
      surchargeAmount: v.surcharge_amount !== null ? Number(v.surcharge_amount) : null,
      surchargeReason: v.surcharge_reason,
    });
    variantsByGroup.set(v.artist_product_group_id, list);
  }

  const imagesByGroup = new Map<string, string[]>();
  for (const img of groupImages ?? []) {
    const list = imagesByGroup.get(img.artist_product_group_id) ?? [];
    list.push(img.image_url);
    imagesByGroup.set(img.artist_product_group_id, list);
  }

  return groupRows.map((g) => ({
    id: g.id,
    teacherId: g.teacher_id,
    name: g.name,
    price: Number(g.price),
    imageUrl: g.image_url,
    images: imagesByGroup.get(g.id) ?? [],
    tags: g.tags ?? [],
    sortOrder: g.sort_order,
    arrivalStatus: g.arrival_status,
    isArchived: g.is_archived,
    isBlindDraw: g.is_blind_draw,
    blindDrawThresholdQty: g.blind_draw_threshold_qty,
    blindDrawPickQty: g.blind_draw_pick_qty,
    isCpSpoiler: g.is_cp_spoiler,
    surchargeAmount: g.surcharge_amount !== null ? Number(g.surcharge_amount) : null,
    surchargeReason: g.surcharge_reason,
    variants: variantsByGroup.get(g.id) ?? [],
  }));
}
