-- 系統健康度：資料庫大小需要一個 RPC 函式才能透過 Supabase JS client 取得
-- （pg_database_size 是普通 SQL 函式，一般角色都能呼叫，用 security definer 包裝成 RPC）。
create or replace function get_database_size_bytes()
returns bigint
language sql
security definer
set search_path = public
as $$
  select pg_database_size(current_database());
$$;

-- system_health_cache：固定只有一列（id 恆為 1），快取「系統健康度」頁面需要的統計數字，
-- 避免每次開頁都重新掃描 Storage 全部檔案。後台讀取時若 updated_at 超過設定的快取時間
-- （目前程式碼設定 30 分鐘，見 src/lib/data/system-health.ts）才會重新計算並覆蓋這一列。
create table if not exists system_health_cache (
  id int primary key default 1,
  stats jsonb not null,
  updated_at timestamptz not null default now(),
  constraint system_health_cache_singleton check (id = 1)
);
