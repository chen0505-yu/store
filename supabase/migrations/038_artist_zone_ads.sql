-- 平台調整：繪師預購專區首頁最上方的廣告區，只有 super_admin 可以管理。
create table if not exists artist_zone_ads (
  id uuid primary key default gen_random_uuid(),
  image_url text,
  title text not null,
  description text,
  link_url text,
  is_visible boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table artist_zone_ads enable row level security;

drop policy if exists "public read visible artist zone ads" on artist_zone_ads;
create policy "public read visible artist zone ads" on artist_zone_ads
  for select using (is_visible = true);
