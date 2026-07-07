import type { SupabaseClient } from "@supabase/supabase-js";

// 繪師代碼：4~6 碼短 UUID，排除易混淆字元（0/O、1/I/L）。比照 src/lib/teacher-code.ts，
// 但 pos_artists 跟 teachers 是完全獨立的資料表，各自的代碼不互相檢查唯一性。
const CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const LENGTH = 5;

export function generateArtistCode(): string {
  let code = "";
  for (let i = 0; i < LENGTH; i++) {
    code += CHARSET[Math.floor(Math.random() * CHARSET.length)];
  }
  return code;
}

export async function getUniqueArtistCode(supabase: SupabaseClient): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateArtistCode();
    const { data } = await supabase
      .from("pos_artists")
      .select("id")
      .eq("artist_code", code)
      .maybeSingle();
    if (!data) return code;
  }
  throw new Error("繪師代碼產生失敗，請重試");
}
