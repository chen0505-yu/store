import { createClient, SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;
let warned = false;

// Phase1 目前所有資料存取都在伺服器端（Server Components / Server Actions）
// 進行，直接使用 Service Role Key，尚未使用 anon key 給瀏覽器端使用。
export function getSupabaseServerClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    if (!warned) {
      console.warn(
        "[LITAN] 尚未設定 Supabase 環境變數（NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY），資料庫功能將無法使用，請參考 .env.local.example。"
      );
      warned = true;
    }
    return null;
  }

  if (!cachedClient) {
    cachedClient = createClient(url, serviceRoleKey, {
      auth: { persistSession: false },
    });
  }

  return cachedClient;
}
