import { getSupabaseServerClient } from "@/lib/supabase/server";

export interface ArchivedGroupRow {
  id: string;
  name: string;
  price: number;
  imageUrl: string | null;
  teacherId: string;
  teacherName: string;
  teacherCode: string;
}

// 已封存品項清單：葴葴預購（product_groups）跟繪師預購（artist_product_groups）分開查詢，
// 兩邊架構相同但獨立建表，維持「預購與現貨／葴葴與繪師必須完全分流」的既有規則。
export async function getArchivedProductGroups(): Promise<ArchivedGroupRow[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const { data: groups } = await supabase
    .from("product_groups")
    .select("id, name, price, image_url, teacher_id")
    .eq("is_archived", true)
    .order("name", { ascending: true });

  const rows = groups ?? [];
  if (rows.length === 0) return [];

  const teacherIds = Array.from(new Set(rows.map((g) => g.teacher_id)));
  const { data: teachers } = await supabase.from("teachers").select("id, name, teacher_code").in("id", teacherIds);
  const teacherMap = new Map((teachers ?? []).map((t) => [t.id, t]));

  return rows.map((g) => {
    const teacher = teacherMap.get(g.teacher_id);
    return {
      id: g.id,
      name: g.name,
      price: Number(g.price),
      imageUrl: g.image_url,
      teacherId: g.teacher_id,
      teacherName: teacher?.name ?? "（找不到老師）",
      teacherCode: teacher?.teacher_code ?? "-",
    };
  });
}

export async function getArchivedArtistProductGroups(): Promise<ArchivedGroupRow[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const { data: groups } = await supabase
    .from("artist_product_groups")
    .select("id, name, price, image_url, teacher_id")
    .eq("is_archived", true)
    .order("name", { ascending: true });

  const rows = groups ?? [];
  if (rows.length === 0) return [];

  const teacherIds = Array.from(new Set(rows.map((g) => g.teacher_id)));
  const { data: teachers } = await supabase.from("teachers").select("id, name, teacher_code").in("id", teacherIds);
  const teacherMap = new Map((teachers ?? []).map((t) => [t.id, t]));

  return rows.map((g) => {
    const teacher = teacherMap.get(g.teacher_id);
    return {
      id: g.id,
      name: g.name,
      price: Number(g.price),
      imageUrl: g.image_url,
      teacherId: g.teacher_id,
      teacherName: teacher?.name ?? "（找不到繪師）",
      teacherCode: teacher?.teacher_code ?? "-",
    };
  });
}
