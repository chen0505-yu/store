import { getSupabaseServerClient } from "@/lib/supabase/server";

export interface ArtistAccount {
  id: string;
  username: string;
  displayName: string;
  isActive: boolean;
  teacherId: string;
  teacherCode: string;
  teacherName: string;
  createdAt: string;
}

// super_admin 專用的繪師帳號清單，一次帶出對應的商店（teachers）身分資訊。
export async function listArtistAccounts(): Promise<ArtistAccount[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const { data: admins, error } = await supabase
    .from("admin_users")
    .select("id, username, display_name, is_active, teacher_id, created_at")
    .eq("role", "artist")
    .order("created_at", { ascending: false });

  if (error || !admins) {
    console.error("[LITAN] 讀取繪師帳號失敗", error?.message);
    return [];
  }

  const teacherIds = admins.map((a) => a.teacher_id).filter((id): id is string => Boolean(id));
  const { data: teachers } = teacherIds.length > 0
    ? await supabase.from("teachers").select("id, teacher_code, name").in("id", teacherIds)
    : { data: [] };
  const teacherMap = new Map((teachers ?? []).map((t) => [t.id, t]));

  return admins
    .filter((a): a is typeof a & { teacher_id: string } => Boolean(a.teacher_id && teacherMap.has(a.teacher_id)))
    .map((a) => {
      const teacher = teacherMap.get(a.teacher_id)!;
      return {
        id: a.id,
        username: a.username,
        displayName: a.display_name,
        isActive: a.is_active,
        teacherId: a.teacher_id,
        teacherCode: teacher.teacher_code,
        teacherName: teacher.name,
        createdAt: a.created_at,
      };
    });
}
