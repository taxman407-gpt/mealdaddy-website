create table if not exists public.saved_foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type text not null default 'packaged_product'
    check (item_type in ('packaged_product', 'home_meal', 'restaurant_item')),
  name text not null check (char_length(name) between 1 and 160),
  brand_or_restaurant text not null default '' check (char_length(brand_or_restaurant) <= 160),
  serving_description text not null default '1 serving' check (char_length(serving_description) between 1 and 160),
  calories numeric(8,2) not null default 0 check (calories between 0 and 10000),
  protein_g numeric(8,2) not null default 0 check (protein_g between 0 and 1000),
  carbs_g numeric(8,2) not null default 0 check (carbs_g between 0 and 2000),
  net_carbs_g numeric(8,2) not null default 0 check (net_carbs_g between 0 and 2000),
  fat_g numeric(8,2) not null default 0 check (fat_g between 0 and 1000),
  fiber_g numeric(8,2) not null default 0 check (fiber_g between 0 and 500),
  sugar_alcohols_g numeric(8,2) not null default 0 check (sugar_alcohols_g between 0 and 500),
  allulose_g numeric(8,2) not null default 0 check (allulose_g between 0 and 500),
  hydration_ounces numeric(8,2) not null default 0 check (hydration_ounces between 0 and 500),
  evidence_type text not null default 'manual'
    check (evidence_type in ('nutrition_label', 'restaurant_published', 'photo_estimate', 'manual')),
  confidence text not null default 'medium' check (confidence in ('low', 'medium', 'high')),
  notes text not null default '' check (char_length(notes) <= 1000),
  photo_path text check (photo_path is null or char_length(photo_path) <= 500),
  last_verified_on date not null default current_date,
  use_count integer not null default 0 check (use_count >= 0),
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saved_foods_user_updated_idx
  on public.saved_foods (user_id, updated_at desc);

alter table public.saved_foods enable row level security;

revoke all on table public.saved_foods from public, anon, authenticated;
grant select, insert, update, delete on table public.saved_foods to authenticated;
grant select, insert, update, delete on table public.saved_foods to service_role;

drop policy if exists "Users can read their own saved foods" on public.saved_foods;
create policy "Users can read their own saved foods"
  on public.saved_foods for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own saved foods" on public.saved_foods;
create policy "Users can insert their own saved foods"
  on public.saved_foods for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own saved foods" on public.saved_foods;
create policy "Users can update their own saved foods"
  on public.saved_foods for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own saved foods" on public.saved_foods;
create policy "Users can delete their own saved foods"
  on public.saved_foods for delete
  to authenticated
  using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'saved-food-photos',
  'saved-food-photos',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can read their own saved food photos" on storage.objects;
create policy "Users can read their own saved food photos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'saved-food-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can upload their own saved food photos" on storage.objects;
create policy "Users can upload their own saved food photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'saved-food-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can update their own saved food photos" on storage.objects;
create policy "Users can update their own saved food photos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'saved-food-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'saved-food-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can delete their own saved food photos" on storage.objects;
create policy "Users can delete their own saved food photos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'saved-food-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
