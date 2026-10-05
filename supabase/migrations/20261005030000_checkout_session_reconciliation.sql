begin;

create table if not exists public.stripe_checkout_sessions (
  checkout_session_id text primary key,
  user_id uuid not null references auth.users(id) on delete restrict,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text not null default 'unknown'
    check (status in ('unknown', 'open', 'complete', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stripe_checkout_sessions_user_id_idx
  on public.stripe_checkout_sessions (user_id);

alter table public.stripe_checkout_sessions enable row level security;
revoke all on table public.stripe_checkout_sessions from public, anon, authenticated;
grant select, insert, update, delete on table public.stripe_checkout_sessions to service_role;

comment on table public.stripe_checkout_sessions is
  'Durable user ownership for every Stripe Checkout Session; unresolved rows prevent auth-user deletion.';

-- Preserve associations already recorded for trial checkouts. Their live state
-- is intentionally unknown until the deletion workflow retrieves Stripe.
insert into public.stripe_checkout_sessions (
  checkout_session_id,
  user_id,
  status,
  created_at,
  updated_at
)
select
  reservation.stripe_checkout_session_id,
  reservation.user_id,
  'unknown',
  reservation.created_at,
  reservation.updated_at
from public.subscription_trial_reservations as reservation
where reservation.stripe_checkout_session_id is not null
on conflict (checkout_session_id) do nothing;

commit;
