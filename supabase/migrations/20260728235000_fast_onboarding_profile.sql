alter table public.profiles
  add column if not exists onboarding_data jsonb not null default '{}'::jsonb,
  add column if not exists onboarding_completed_at timestamptz;
