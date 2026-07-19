-- 平台調整：繪師預購商品架構，跟葴葴預購（product_groups/product_variants）架構完全對應
-- （老師 → 品項 → 細項），但獨立建表，維持「葴葴商品與繪師商品不可放入同一購物車／訂單」的
-- 要求。teacher_id 指向同一張 teachers 表（is_artist_shop = true 的那些老師 row）。
create table if not exists artist_product_groups (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references teachers(id) on delete cascade,
  name text not null,
  price numeric(10, 2) not null default 0,
  image_url text,
  tags text[] not null default '{}',
  sort_order int not null default 0,
  arrival_status product_arrival_status not null default 'preordering',
  is_archived boolean not null default false,
  is_blind_draw boolean not null default false,
  blind_draw_threshold_qty int,
  blind_draw_pick_qty int,
  is_cp_spoiler boolean not null default false,
  surcharge_amount numeric(10, 2),
  surcharge_reason text,
  created_at timestamptz not null default now()
);

create index if not exists artist_product_groups_teacher_id_idx on artist_product_groups(teacher_id);

create table if not exists artist_product_group_images (
  id uuid primary key default gen_random_uuid(),
  artist_product_group_id uuid not null references artist_product_groups(id) on delete cascade,
  image_url text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists artist_product_variants (
  id uuid primary key default gen_random_uuid(),
  artist_product_group_id uuid not null references artist_product_groups(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  is_bonus_option boolean not null default false,
  surcharge_amount numeric(10, 2),
  surcharge_reason text,
  created_at timestamptz not null default now()
);

create index if not exists artist_product_variants_group_id_idx on artist_product_variants(artist_product_group_id);

alter table artist_product_groups enable row level security;
alter table artist_product_group_images enable row level security;
alter table artist_product_variants enable row level security;

drop policy if exists "public read artist product groups" on artist_product_groups;
create policy "public read artist product groups" on artist_product_groups
  for select using (is_archived = false);

drop policy if exists "public read artist product group images" on artist_product_group_images;
create policy "public read artist product group images" on artist_product_group_images
  for select using (true);

drop policy if exists "public read artist product variants" on artist_product_variants;
create policy "public read artist product variants" on artist_product_variants
  for select using (is_active = true);
