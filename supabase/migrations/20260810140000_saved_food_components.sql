alter table public.saved_foods
  add column if not exists components jsonb not null default '[]'::jsonb;

alter table public.saved_foods
  drop constraint if exists saved_foods_components_check;

alter table public.saved_foods
  add constraint saved_foods_components_check
  check (
    jsonb_typeof(components) = 'array'
    and jsonb_array_length(components) <= 15
    and octet_length(components::text) <= 12000
  );

alter table public.saved_foods
  drop constraint if exists saved_foods_evidence_type_check;

alter table public.saved_foods
  add constraint saved_foods_evidence_type_check
  check (evidence_type in (
    'nutrition_label',
    'restaurant_published',
    'restaurant_estimate',
    'mixed_estimate',
    'photo_estimate',
    'description_estimate',
    'manual'
  ));
