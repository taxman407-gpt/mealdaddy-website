alter table public.saved_foods
  drop constraint if exists saved_foods_evidence_type_check;

alter table public.saved_foods
  add constraint saved_foods_evidence_type_check
  check (evidence_type in (
    'nutrition_label',
    'restaurant_published',
    'restaurant_estimate',
    'photo_estimate',
    'manual'
  ));
