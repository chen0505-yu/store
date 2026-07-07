"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export interface ActionResult {
  success: boolean;
  message: string;
}

export interface UpdateInstockSettingsInput {
  isOpen: boolean;
  startsAt: string | null;
  endsAt: string | null;
}

// 現貨區設定全站只有一列，更新前先確保這一列存在（理論上 migration 已經建立）。
export async function updateInstockSettings(
  input: UpdateInstockSettingsInput
): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { data: existing } = await supabase.from("instock_settings").select("id").limit(1).maybeSingle();

  const payload = {
    is_open: input.isOpen,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    updated_at: new Date().toISOString(),
  };

  const { error } = existing
    ? await supabase.from("instock_settings").update(payload).eq("id", existing.id)
    : await supabase.from("instock_settings").insert(payload);

  if (error) return { success: false, message: error.message };

  revalidatePath("/instock");
  revalidatePath("/admin/instock-settings");
  return { success: true, message: "現貨區設定已更新" };
}
