import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { ArrivalStatus } from "@/lib/types";

export interface AdminVariant {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  isBonusOption: boolean; // 是否為盲抽可選的保底細項
  surchargeAmount: number | null; // 二補金額，null 代表未設定，優先於品項層級的設定
  surchargeReason: string | null;
}

export interface AdminProductGroup {
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
  surchargeAmount: number | null; // 品項層級的二補金額，細項若沒設定就用這個
  surchargeReason: string | null;
  variants: AdminVariant[];
}

export interface AdminEventPickupOption {
  id: string;
  eventName: string;
  sessionName: string | null;
  displayName: string;
  isActive: boolean;
}

export interface AdminTeacherShop {
  teacherId: string;
  teacherCode: string;
  teacherName: string;
  avatarUrl: string | null;
  images: string[]; // 老師賣場封面圖，跟現貨賣場共用同一組 teacher_images
  preorderStartsAt: string | null;
  preorderEndsAt: string | null;
  allowEventPickup: boolean;
  eventPickupOptions: AdminEventPickupOption[];
  groups: AdminProductGroup[];
}

// 後台老師賣場管理：只列出「有預購品項」的老師（品項/細項架構），
// 純現貨用的老師（沒有任何 product_groups）不會出現在這裡。
export async function getAdminTeacherShops(): Promise<AdminTeacherShop[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const { data: groups, error } = await supabase
    .from("product_groups")
    .select(
      "id, teacher_id, name, price, image_url, tags, sort_order, arrival_status, is_archived, is_blind_draw, blind_draw_threshold_qty, blind_draw_pick_qty, is_cp_spoiler, surcharge_amount, surcharge_reason"
    )
    .eq("is_archived", false)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[LITAN] 讀取老師賣場品項失敗", error.message);
    return [];
  }

  const groupRows = groups ?? [];
  if (groupRows.length === 0) return [];

  const teacherIds = Array.from(new Set(groupRows.map((g) => g.teacher_id)));
  const groupIds = groupRows.map((g) => g.id);

  const [{ data: teachers }, { data: variants }, { data: groupImages }, { data: teacherImages }, { data: eventPickupOptions }] =
    await Promise.all([
      supabase
        .from("teachers")
        .select("id, teacher_code, name, avatar_url, preorder_starts_at, preorder_ends_at, allow_event_pickup")
        .in("id", teacherIds),
      supabase
        .from("product_variants")
        .select(
          "id, product_group_id, name, sort_order, is_active, is_bonus_option, surcharge_amount, surcharge_reason"
        )
        .in("product_group_id", groupIds)
        .order("sort_order", { ascending: true }),
      supabase
        .from("product_group_images")
        .select("product_group_id, image_url, sort_order")
        .in("product_group_id", groupIds)
        .order("sort_order", { ascending: true }),
      supabase
        .from("teacher_images")
        .select("teacher_id, image_url, sort_order")
        .in("teacher_id", teacherIds)
        .order("sort_order", { ascending: true }),
      supabase
        .from("event_pickup_options")
        .select("id, teacher_id, event_name, session_name, display_name, is_active, sort_order")
        .in("teacher_id", teacherIds)
        .order("sort_order", { ascending: true }),
    ]);

  const teacherMap = new Map((teachers ?? []).map((t) => [t.id, t]));

  const eventPickupOptionsByTeacher = new Map<string, AdminEventPickupOption[]>();
  for (const o of eventPickupOptions ?? []) {
    const list = eventPickupOptionsByTeacher.get(o.teacher_id) ?? [];
    list.push({
      id: o.id,
      eventName: o.event_name,
      sessionName: o.session_name,
      displayName: o.display_name,
      isActive: o.is_active,
    });
    eventPickupOptionsByTeacher.set(o.teacher_id, list);
  }

  const variantsByGroup = new Map<string, AdminVariant[]>();
  for (const v of variants ?? []) {
    const list = variantsByGroup.get(v.product_group_id) ?? [];
    list.push({
      id: v.id,
      name: v.name,
      sortOrder: v.sort_order,
      isActive: v.is_active,
      isBonusOption: v.is_bonus_option,
      surchargeAmount: v.surcharge_amount !== null ? Number(v.surcharge_amount) : null,
      surchargeReason: v.surcharge_reason,
    });
    variantsByGroup.set(v.product_group_id, list);
  }

  const imagesByGroup = new Map<string, string[]>();
  for (const img of groupImages ?? []) {
    const list = imagesByGroup.get(img.product_group_id) ?? [];
    list.push(img.image_url);
    imagesByGroup.set(img.product_group_id, list);
  }

  const imagesByTeacher = new Map<string, string[]>();
  for (const img of teacherImages ?? []) {
    const list = imagesByTeacher.get(img.teacher_id) ?? [];
    list.push(img.image_url);
    imagesByTeacher.set(img.teacher_id, list);
  }

  const shopsByTeacher = new Map<string, AdminTeacherShop>();
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
        preorderStartsAt: teacher.preorder_starts_at,
        preorderEndsAt: teacher.preorder_ends_at,
        allowEventPickup: teacher.allow_event_pickup,
        eventPickupOptions: eventPickupOptionsByTeacher.get(teacher.id) ?? [],
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
      arrivalStatus: g.arrival_status,
      isArchived: g.is_archived,
      isBlindDraw: g.is_blind_draw,
      blindDrawThresholdQty: g.blind_draw_threshold_qty,
      blindDrawPickQty: g.blind_draw_pick_qty,
      isCpSpoiler: g.is_cp_spoiler,
      surchargeAmount: g.surcharge_amount !== null ? Number(g.surcharge_amount) : null,
      surchargeReason: g.surcharge_reason,
      variants: variantsByGroup.get(g.id) ?? [],
    });
  }

  return Array.from(shopsByTeacher.values()).sort((a, b) =>
    a.teacherName.localeCompare(b.teacherName, "zh-Hant")
  );
}
