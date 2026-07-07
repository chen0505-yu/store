import type { SupabaseClient } from "@supabase/supabase-js";

// Teacher ID：4~6 碼短 UUID，排除易混淆字元（0/O、1/I/L）。
const CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const LENGTH = 5;

export function generateTeacherCode(): string {
  let code = "";
  for (let i = 0; i < LENGTH; i++) {
    code += CHARSET[Math.floor(Math.random() * CHARSET.length)];
  }
  return code;
}

// 產生一個尚未被使用的 Teacher ID，供新增老師（含 Excel 批量匯入建立新老師）共用。
export async function getUniqueTeacherCode(supabase: SupabaseClient): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateTeacherCode();
    const { data } = await supabase
      .from("teachers")
      .select("id")
      .eq("teacher_code", code)
      .maybeSingle();
    if (!data) return code;
  }
  throw new Error("Teacher ID 產生失敗，請重試");
}
