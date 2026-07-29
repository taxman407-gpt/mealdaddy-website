alter table public.ledger_entries
  add column if not exists meal_label text;

alter table public.ledger_entries
  drop constraint if exists ledger_entries_meal_label_check;

alter table public.ledger_entries
  add constraint ledger_entries_meal_label_check
  check (
    meal_label is null
    or meal_label in ('Breakfast', 'Brunch', 'Lunch', 'Dinner', 'Snack')
  );
