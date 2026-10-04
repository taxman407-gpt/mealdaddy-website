alter table public.saved_foods
  add column if not exists nickname text not null default '';

alter table public.saved_foods
  drop constraint if exists saved_foods_nickname_length;

alter table public.saved_foods
  add constraint saved_foods_nickname_length
  check (char_length(nickname) <= 80);

comment on column public.saved_foods.nickname is
  'Optional user-chosen shorthand for a recurring meal or restaurant favorite.';
