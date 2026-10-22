-- Defaults OFF. Auth verification only enqueues accounts registered after activation.
create table public.welcome_email_settings(id boolean primary key default true check(id),enabled boolean not null default false,started_at timestamptz);
insert into public.welcome_email_settings(id) values(true);
create table public.welcome_email_deliveries (
 user_id uuid primary key references auth.users(id) on delete cascade,
 template_version text not null default 'welcome-v1',
 event_id text not null unique,
 verified_at timestamptz not null,
 status text not null default 'pending' check(status in ('pending','sending','sent','failed','review_required','canceled')),
 attempts integer not null default 0 check(attempts between 0 and 6),
 recipient text,
 payload jsonb,
 provider_message_id text,
 first_attempt_at timestamptz,
 next_attempt_at timestamptz not null default now(),
 lease_token uuid,
 lease_until timestamptz,
 last_error_code text,
 sent_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.welcome_email_settings enable row level security;
alter table public.welcome_email_deliveries enable row level security;
revoke all on public.welcome_email_settings,public.welcome_email_deliveries from public,anon,authenticated;
grant all on public.welcome_email_settings,public.welcome_email_deliveries to service_role;
create function public.enqueue_verified_welcome() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare settings public.welcome_email_settings%rowtype; begin
 if new.email_confirmed_at is null or new.email is null then return new;end if;
 if tg_op='UPDATE' and old.email_confirmed_at is not null then return new;end if;
 select * into settings from public.welcome_email_settings where id;
 if not settings.enabled or settings.started_at is null or new.created_at<settings.started_at then return new;end if;
 insert into public.welcome_email_deliveries(user_id,event_id,verified_at) values(new.id,'verified:'||new.id::text,new.email_confirmed_at) on conflict(user_id) do nothing;
 return new;
end $$;
revoke all on function public.enqueue_verified_welcome() from public,anon,authenticated,service_role;
create trigger enqueue_verified_welcome after insert or update of email_confirmed_at on auth.users for each row execute function public.enqueue_verified_welcome();
create function public.claim_welcome_delivery() returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare delivery public.welcome_email_deliveries%rowtype; recipient_email text; begin
 if not exists(select 1 from public.welcome_email_settings where id and enabled) then return null;end if;
 update public.welcome_email_deliveries set status='review_required',last_error_code='IDEMPOTENCY_WINDOW_EXPIRED',updated_at=now()
 where status in ('pending','sending') and (first_attempt_at<now()-interval '23 hours' or (attempts>=6 and (lease_until is null or lease_until<now())));
 select d.* into delivery from public.welcome_email_deliveries d where d.status in ('pending','sending') and d.attempts<6 and d.next_attempt_at<=now() and (d.lease_until is null or d.lease_until<now()) order by d.created_at,d.user_id for update skip locked limit 1;
 if not found then return null;end if;
 select u.email into recipient_email from auth.users u where u.id=delivery.user_id and u.email_confirmed_at is not null and u.deleted_at is null;
 if recipient_email is null or (delivery.recipient is not null and recipient_email<>delivery.recipient) then
  update public.welcome_email_deliveries set status='canceled',last_error_code='ACCOUNT_UNAVAILABLE_OR_EMAIL_CHANGED',updated_at=now() where user_id=delivery.user_id;return null;
 end if;
 update public.welcome_email_deliveries set status='sending',recipient=recipient_email,attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()),lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',updated_at=now() where user_id=delivery.user_id returning * into delivery;
 return to_jsonb(delivery);
end $$;
revoke all on function public.claim_welcome_delivery() from public,anon,authenticated;
grant execute on function public.claim_welcome_delivery() to service_role;
create index on public.welcome_email_deliveries(status,next_attempt_at);

create or replace view public.owner_registration_report with (security_barrier=true) as
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
 else 'unknown_reconciliation' end as conversion_status,
 w.sent_at as welcome_sent_at, null::timestamptz as trial_started_at
from auth.users u
left join public.welcome_email_deliveries w on w.user_id=u.id
left join public.subscriptions s on s.user_id=u.id
left join public.lifetime_licenses l on l.user_id=u.id
left join public.complimentary_access_grants g on g.user_id=u.id
left join public.email_contact_preferences pref on pref.user_id=u.id
left join lateral (select x.checkout_session_id,x.stripe_customer_id,x.status,x.created_at from public.stripe_checkout_sessions x where x.user_id=u.id order by x.created_at desc,x.checkout_session_id desc limit 1) c on true
left join lateral (select min(p.paid_at) as first_paid_at,bool_or(p.stripe_subscription_id=s.stripe_subscription_id) as current_subscription_paid from public.billing_payment_evidence p where p.user_id=u.id) pay on true
left join lateral (select min(p.paid_at) as first_lifetime_paid_at from public.lifetime_payments p where p.user_id=u.id and p.kind='purchase' and p.amount_cents>0) lp on true
where u.deleted_at is null;
