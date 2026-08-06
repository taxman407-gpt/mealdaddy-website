create table if not exists public.weight_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  measured_on date not null default current_date,
  weight_kg numeric(6,2) not null check (weight_kg between 20 and 500),
  source text not null default 'home' check (source in ('setup', 'home', 'clinic', 'gym', 'smart_scale', 'other')),
  bmi_override numeric(5,2) check (bmi_override is null or bmi_override between 5 and 100),
  body_fat_pct numeric(5,2) check (body_fat_pct is null or body_fat_pct between 2 and 75),
  waist_cm numeric(6,2) check (waist_cm is null or waist_cm between 30 and 250),
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, measured_on)
);

create index if not exists weight_entries_user_measured_on_idx
  on public.weight_entries (user_id, measured_on desc);

alter table public.weight_entries enable row level security;

revoke all on table public.weight_entries from anon, authenticated;
grant select, insert, update, delete on table public.weight_entries to authenticated;
grant select, insert, update, delete on table public.weight_entries to service_role;

drop policy if exists "Users can read their own weight entries" on public.weight_entries;
create policy "Users can read their own weight entries"
  on public.weight_entries for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own weight entries" on public.weight_entries;
create policy "Users can insert their own weight entries"
  on public.weight_entries for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own weight entries" on public.weight_entries;
create policy "Users can update their own weight entries"
  on public.weight_entries for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own weight entries" on public.weight_entries;
create policy "Users can delete their own weight entries"
  on public.weight_entries for delete
  to authenticated
  using ((select auth.uid()) = user_id);

insert into public.weight_entries (user_id, measured_on, weight_kg, source, note)
select
  profiles.user_id,
  coalesce(profiles.onboarding_completed_at::date, profiles.updated_at::date, current_date),
  round(((profiles.onboarding_data ->> 'current_weight')::numeric *
    case
      when lower(coalesce(profiles.onboarding_data ->> 'unit_system', 'us')) = 'metric' then 1
      else 0.45359237
    end)::numeric, 2),
  'setup',
  'Starting weight imported from setup'
from public.profiles
where coalesce(profiles.onboarding_data ->> 'current_weight', '') ~ '^[0-9]+([.][0-9]+)?$'
  and not exists (
    select 1 from public.weight_entries existing where existing.user_id = profiles.user_id
  )
on conflict (user_id, measured_on) do nothing;
