import { createClient, SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;

// POS 專用的 Supabase client（跟網路商城共用的 src/lib/supabase/server.ts 分開，避免
// 影響既有商城行為）。明確關閉 fetch 快取：POS 是現場即時收銀，活動/庫存/訂單資料
// 一定要每次都讀到最新狀態，不能被 Next.js 的 fetch 快取存到舊資料。
export function getPosSupabaseServerClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) return null;

  if (!cachedClient) {
    cachedClient = createClient(url, serviceRoleKey, {
      auth: { persistSession: false },
      global: {
        fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
      },
    });
  }

  return cachedClient;
}
