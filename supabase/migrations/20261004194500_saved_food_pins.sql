alter table public.saved_foods
  add column if not exists is_pinned boolean not null default false;

comment on column public.saved_foods.is_pinned is
  'User-controlled favorite placement. The application limits each user to three pinned favorites.';

create index if not exists saved_foods_user_pinned_name_idx
  on public.saved_foods (user_id, is_pinned desc, nickname, name);
