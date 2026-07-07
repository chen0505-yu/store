import { getSupabaseServerClient } from "@/lib/supabase/server";

export interface Teacher {
  id: string;
  teacherCode: string;
  name: string;
  avatarUrl: string | null;
  socialUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  preorderStartsAt: string | null;
  preorderEndsAt: string | null;
}

interface TeacherRow {
  id: string;
  teacher_code: string;
  name: string;
  avatar_url: string | null;
  social_url: string | null;
  sort_order: number;
  is_active: boolean;
  preorder_starts_at: string | null;
  preorder_ends_at: string | null;
}

export async function getAllTeachers(): Promise<Teacher[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("teachers")
    .select(
      "id, teacher_code, name, avatar_url, social_url, sort_order, is_active, preorder_starts_at, preorder_ends_at"
    )
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[LITAN] 讀取老師資料失敗", error.message);
    return [];
  }

  return ((data ?? []) as TeacherRow[]).map((t) => ({
    id: t.id,
    teacherCode: t.teacher_code,
    name: t.name,
    avatarUrl: t.avatar_url,
    socialUrl: t.social_url,
    sortOrder: t.sort_order,
    isActive: t.is_active,
    preorderStartsAt: t.preorder_starts_at,
    preorderEndsAt: t.preorder_ends_at,
  }));
}
