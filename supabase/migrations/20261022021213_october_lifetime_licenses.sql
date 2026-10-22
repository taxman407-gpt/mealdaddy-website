-- Isolated October release. Apply to the test project first; production requires acceptance.
create table if not exists public.lifetime_licenses (
 user_id uuid primary key references auth.users(id) on delete cascade,
 plan_key text not null check(plan_key in ('core','byo')),
 status text not null check(status in ('paid','refunded','revoked','reconciliation_required')),
 purchased_at timestamptz not null,
 maintenance_paid_through timestamptz not null,
 updated_at timestamptz not null default now()
);
create table if not exists public.lifetime_payments (
 checkout_session_id text primary key,
 payment_intent_id text not null unique,
 user_id uuid not null references auth.users(id) on delete cascade,
 plan_key text not null check(plan_key in ('core','byo')),
 kind text not null check(kind in ('purchase','maintenance')),
 status text not null default 'paid' check(status in ('paid','refunded')),
 amount_cents bigint not null check(amount_cents>=0),
 paid_at timestamptz not null,
 prior_access_through timestamptz,
 access_through timestamptz not null
);
create table if not exists public.lifetime_maintenance_notices (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 plan_key text not null check(plan_key in ('core','byo')),
 amount_cents bigint not null check(amount_cents>=0),
 notified_at timestamptz not null,
 effective_at timestamptz not null,
 check(effective_at >= notified_at + interval '60 days')
);
alter table public.lifetime_licenses enable row level security;
alter table public.lifetime_payments enable row level security;
alter table public.lifetime_maintenance_notices enable row level security;
revoke all on public.lifetime_licenses, public.lifetime_payments, public.lifetime_maintenance_notices from anon,authenticated;
grant select on public.lifetime_licenses, public.lifetime_payments, public.lifetime_maintenance_notices to authenticated;
grant all on public.lifetime_licenses, public.lifetime_payments, public.lifetime_maintenance_notices to service_role;
drop policy if exists lifetime_license_own_read on public.lifetime_licenses;
create policy lifetime_license_own_read on public.lifetime_licenses for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists lifetime_payment_own_read on public.lifetime_payments;
create policy lifetime_payment_own_read on public.lifetime_payments for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists lifetime_notice_own_read on public.lifetime_maintenance_notices;
create policy lifetime_notice_own_read on public.lifetime_maintenance_notices for select to authenticated using ((select auth.uid())=user_id);
create or replace function public.record_lifetime_payment(
 requested_user_id uuid, requested_session_id text, requested_payment_intent_id text,
 requested_plan_key text, requested_kind text, requested_amount_cents bigint, requested_paid_at timestamptz
) returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare existing_payment public.lifetime_payments%rowtype; license public.lifetime_licenses%rowtype; through_date timestamptz; prior_date timestamptz;
begin
 perform pg_advisory_xact_lock(hashtextextended(requested_user_id::text,1401));
 select * into existing_payment from public.lifetime_payments where checkout_session_id=requested_session_id;
 if found then
  if existing_payment.user_id<>requested_user_id or existing_payment.payment_intent_id<>requested_payment_intent_id or existing_payment.plan_key<>requested_plan_key or existing_payment.kind<>requested_kind then raise exception 'PAYMENT_OWNERSHIP_CONFLICT'; end if;
  return false;
 end if;
 if requested_plan_key not in ('core','byo') or requested_kind not in ('purchase','maintenance') or requested_amount_cents<0 then raise exception 'INVALID_LICENSE_PAYMENT'; end if;
 select * into license from public.lifetime_licenses where user_id=requested_user_id for update;
 if requested_kind='purchase' then
  if found then raise exception 'LICENSE_ALREADY_EXISTS'; end if;
  through_date:=requested_paid_at+interval '3 years';
  insert into public.lifetime_licenses(user_id,plan_key,status,purchased_at,maintenance_paid_through) values(requested_user_id,requested_plan_key,'paid',requested_paid_at,through_date);
 else
  if not found or license.status<>'paid' or license.plan_key<>requested_plan_key then raise exception 'VALID_LICENSE_REQUIRED'; end if;
  prior_date:=license.maintenance_paid_through;
  through_date:=greatest(license.maintenance_paid_through,requested_paid_at)+interval '1 year';
  update public.lifetime_licenses set maintenance_paid_through=through_date,updated_at=now() where user_id=requested_user_id;
 end if;
 insert into public.lifetime_payments(checkout_session_id,payment_intent_id,user_id,plan_key,kind,amount_cents,paid_at,prior_access_through,access_through)
 values(requested_session_id,requested_payment_intent_id,requested_user_id,requested_plan_key,requested_kind,requested_amount_cents,requested_paid_at,prior_date,through_date);
 return true;
end $$;
revoke all on function public.record_lifetime_payment(uuid,text,text,text,text,bigint,timestamptz) from public,anon,authenticated;
grant execute on function public.record_lifetime_payment(uuid,text,text,text,text,bigint,timestamptz) to service_role;

create index if not exists lifetime_payments_user_idx on public.lifetime_payments(user_id);
create index if not exists lifetime_notices_user_idx on public.lifetime_maintenance_notices(user_id);
drop policy if exists lifetime_license_mfa on public.lifetime_licenses;
create policy lifetime_license_mfa on public.lifetime_licenses as restrictive for select to authenticated using ((select app_private.mfa_access_allowed()));
drop policy if exists lifetime_payment_mfa on public.lifetime_payments;
create policy lifetime_payment_mfa on public.lifetime_payments as restrictive for select to authenticated using ((select app_private.mfa_access_allowed()));
drop policy if exists lifetime_notice_mfa on public.lifetime_maintenance_notices;
create policy lifetime_notice_mfa on public.lifetime_maintenance_notices as restrictive for select to authenticated using ((select app_private.mfa_access_allowed()));
create table if not exists public.lifetime_checkout_quotes (
 checkout_session_id text primary key references public.stripe_checkout_sessions(checkout_session_id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 plan_key text not null check(plan_key in ('core','byo')),
 kind text not null check(kind in ('purchase','maintenance')),
 price_id text not null,
 amount_cents bigint not null check(amount_cents>=0),
 created_at timestamptz not null default now()
);
alter table public.lifetime_checkout_quotes enable row level security;
revoke all on public.lifetime_checkout_quotes from anon,authenticated;
grant select on public.lifetime_checkout_quotes to authenticated;
grant all on public.lifetime_checkout_quotes to service_role;
create index if not exists lifetime_checkout_quotes_user_idx on public.lifetime_checkout_quotes(user_id);
drop policy if exists lifetime_quote_own_read on public.lifetime_checkout_quotes;
create policy lifetime_quote_own_read on public.lifetime_checkout_quotes for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists lifetime_quote_mfa on public.lifetime_checkout_quotes;
create policy lifetime_quote_mfa on public.lifetime_checkout_quotes as restrictive for select to authenticated using ((select app_private.mfa_access_allowed()));
alter table public.lifetime_payments add column if not exists refunded_cents bigint not null default 0 check(refunded_cents>=0);
create or replace function public.record_lifetime_refund(requested_payment_intent_id text,requested_refunded_cents bigint)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare payment public.lifetime_payments%rowtype;
begin
 select * into payment from public.lifetime_payments where payment_intent_id=requested_payment_intent_id;
 if not found then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended(payment.user_id::text,1401));
 select * into payment from public.lifetime_payments where payment_intent_id=requested_payment_intent_id for update;
 if requested_refunded_cents<=payment.refunded_cents then return false; end if;
 update public.lifetime_payments set refunded_cents=least(requested_refunded_cents,amount_cents),status=case when requested_refunded_cents>=amount_cents then 'refunded' else status end where payment_intent_id=requested_payment_intent_id;
 if requested_refunded_cents>=payment.amount_cents then
  update public.lifetime_licenses set status=case when payment.kind='purchase' then 'refunded' else 'reconciliation_required' end,updated_at=now() where user_id=payment.user_id;
 end if;
 return true;
end $$;
revoke all on function public.record_lifetime_refund(text,bigint) from public,anon,authenticated;
grant execute on function public.record_lifetime_refund(text,bigint) to service_role;
