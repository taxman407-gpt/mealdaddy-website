alter table public.customer_feedback
  add column if not exists public_display_consent boolean not null default false,
  add column if not exists public_consent_updated_at timestamptz;

comment on column public.customer_feedback.public_display_consent is
  'User-controlled permission for Meal Daddy to consider the rating and comment for anonymous public display.';

comment on column public.customer_feedback.public_consent_updated_at is
  'Time the user most recently granted public-display permission; null when permission is not granted.';
