alter table public.saved_foods
  add column if not exists sodium_mg numeric(9,2) not null default 0 check (sodium_mg between 0 and 50000),
  add column if not exists added_sugar_g numeric(8,2) not null default 0 check (added_sugar_g between 0 and 1000),
  add column if not exists saturated_fat_g numeric(8,2) not null default 0 check (saturated_fat_g between 0 and 1000);

comment on column public.saved_foods.sodium_mg is 'Reviewed sodium per saved serving in milligrams.';
comment on column public.saved_foods.added_sugar_g is 'Reviewed added sugar per saved serving in grams.';
comment on column public.saved_foods.saturated_fat_g is 'Reviewed saturated fat per saved serving in grams.';
