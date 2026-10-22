-- Server-only reporting; no auth data is exposed directly to clients.
create table public.billing_payment_evidence (
 invoice_id text primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 stripe_subscription_id text not null,
 amount_paid_cents bigint not null check(amount_paid_cents>0),
 currency text not null,
 paid_at timestamptz not null,
 stripe_event_id text not null
);
create index on public.billing_payment_evidence(user_id);
create table public.owner_report_audit (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 action text not null check(action in ('view','export')),
 filters jsonb not null,
 row_count integer not null check(row_count>=0),
 created_at timestamptz not null default now()
);
alter table public.billing_payment_evidence enable row level security;
alter table public.owner_report_audit enable row level security;
revoke all on public.billing_payment_evidence,public.owner_report_audit from anon,authenticated;
grant all on public.billing_payment_evidence,public.owner_report_audit to service_role;
create view public.owner_registration_report with (security_barrier=true) as
select u.id as user_id,u.email,u.created_at as registered_at,u.email_confirmed_at as verified_at,
 s.plan_key,s.status as subscription_status,s.trial_ends_at,s.current_period_ends_at,s.cancel_at_period_end,
 coalesce(s.stripe_customer_id,c.stripe_customer_id) as stripe_customer_id,s.stripe_subscription_id,
 c.checkout_session_id,c.created_at as last_checkout_at,c.status as checkout_status,
 case when pref.user_id is null then 'unknown' when pref.opted_in then 'opted_in' else 'opted_out' end as marketing_preference,
 pay.first_paid_at,lp.first_lifetime_paid_at,
 case
 when g.status='active' then 'complimentary'
 when l.status='paid' and lp.first_lifetime_paid_at is not null then 'lifetime_paid'
 when s.status='trialing' then 'active_trial'
 when s.status='active' and pay.current_subscription_paid then 'paid_active'
 when s.status='active' then 'unknown_reconciliation'
 when s.status='past_due' then 'past_due'
 when s.status in ('canceled','unpaid','incomplete_expired') then s.status
 when s.status='incomplete' or c.status in ('open','expired','failed') then 'incomplete_checkout'
 when s.user_id is null and l.user_id is null then 'registered_no_linked_subscription'
 else 'unknown_reconciliation' end as conversion_status
from auth.users u
left join public.subscriptions s on s.user_id=u.id
left join public.lifetime_licenses l on l.user_id=u.id
left join public.complimentary_access_grants g on g.user_id=u.id
left join public.email_contact_preferences pref on pref.user_id=u.id
left join lateral (select x.checkout_session_id,x.stripe_customer_id,x.status,x.created_at from public.stripe_checkout_sessions x where x.user_id=u.id order by x.created_at desc,x.checkout_session_id desc limit 1) c on true
left join lateral (select min(p.paid_at) as first_paid_at,bool_or(p.stripe_subscription_id=s.stripe_subscription_id) as current_subscription_paid from public.billing_payment_evidence p where p.user_id=u.id) pay on true
left join lateral (select min(p.paid_at) as first_lifetime_paid_at from public.lifetime_payments p where p.user_id=u.id and p.kind='purchase' and p.amount_cents>0) lp on true
where u.deleted_at is null;
revoke all on public.owner_registration_report from public,anon,authenticated;
grant select on public.owner_registration_report to service_role;
create function public.owner_conversion_report(requested_from timestamptz,requested_to timestamptz,requested_status text,requested_verified text,requested_marketing text,requested_offset integer,requested_limit integer)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
with filtered as materialized (
 select * from public.owner_registration_report r
 where (requested_from is null or registered_at>=requested_from)
 and (requested_to is null or registered_at<requested_to)
 and (requested_status is null or conversion_status=requested_status)
 and (requested_verified is null or (verified_at is not null)=(requested_verified='verified'))
 and (requested_marketing is null or marketing_preference=requested_marketing)
), page as (select * from filtered order by registered_at desc,user_id offset greatest(0,requested_offset) limit least(500,greatest(1,requested_limit)))
select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb),'summary',jsonb_build_object(
 'registrations',count(*),'verified',count(*) filter(where verified_at is not null),'started_checkout',count(*) filter(where checkout_session_id is not null),
 'active_trials',count(*) filter(where conversion_status='active_trial'),'first_successful_payment',count(*) filter(where first_paid_at is not null or first_lifetime_paid_at is not null),
 'paid_conversions',count(*) filter(where first_paid_at is not null or first_lifetime_paid_at is not null),'incomplete_checkouts',count(*) filter(where conversion_status='incomplete_checkout'),
 'conversion_denominator','registrations matching filters','paid_conversion_rate',case when count(*)=0 then 0 else (count(*) filter(where first_paid_at is not null or first_lifetime_paid_at is not null))::numeric/count(*) end
)) from filtered;
$$;
revoke all on function public.owner_conversion_report(timestamptz,timestamptz,text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.owner_conversion_report(timestamptz,timestamptz,text,text,text,integer,integer) to service_role;
