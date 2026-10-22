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
