-- Approval-only affiliates; subscriber point values remain unset until owner configuration.
create table public.referral_program_settings (
 id boolean primary key default true check(id), affiliate_enabled boolean not null default false,
 subscriber_enabled boolean not null default false, started_at timestamptz not null default now(),
 points_per_referral bigint check(points_per_referral>0), cents_per_point integer check(cents_per_point>0),
 monthly_cap_cents integer not null default 500 check(monthly_cap_cents=500),
 check(not subscriber_enabled or (points_per_referral is not null and cents_per_point is not null))
);
insert into public.referral_program_settings(id) values(true);
create table public.affiliate_members (
 user_id uuid primary key references auth.users(id) on delete cascade,
 status text not null check(status in ('pending','approved','rejected')), approved_at timestamptz,
 check(status<>'approved' or approved_at is not null)
);
create table public.referral_codes (
 code uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 channel text not null check(channel in ('affiliate','subscriber')), active boolean not null default true,
 unique(owner_id,channel)
);
create table public.referral_attributions (
 referred_user_id uuid primary key references auth.users(id) on delete cascade,
 referrer_user_id uuid not null references auth.users(id) on delete cascade,
 code uuid not null references public.referral_codes(code), channel text not null check(channel in ('affiliate','subscriber')),
 attributed_at timestamptz not null default now(), first_paid_at timestamptz,
 check(referred_user_id<>referrer_user_id)
);
create table public.referral_receipts (
 receipt_key text primary key, payment_intent_id text,
 referred_user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('subscription','lifetime','maintenance')), paid_at timestamptz not null,
 eligible_net_cents bigint not null check(eligible_net_cents>0), refunded_net_cents bigint not null default 0 check(refunded_net_cents>=0 and refunded_net_cents<=eligible_net_cents)
);
create table public.affiliate_commissions (
 receipt_key text primary key references public.referral_receipts(receipt_key) on delete cascade,
 referrer_user_id uuid not null references auth.users(id) on delete cascade,
 amount_cents bigint not null check(amount_cents>=0), rate_basis_points integer not null check(rate_basis_points in (750,1500)),
 paid_out_cents bigint not null default 0 check(paid_out_cents>=0)
);
create table public.subscriber_referral_rewards (
 referred_user_id uuid primary key references auth.users(id) on delete cascade,
 referrer_user_id uuid not null references auth.users(id) on delete cascade,
 receipt_key text not null references public.referral_receipts(receipt_key), points bigint not null check(points>0),
 revoked boolean not null default false, awarded_at timestamptz not null default now()
);
create table public.referral_redemptions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 billing_month date not null check(extract(day from billing_month)=1), points bigint not null check(points>0),
 amount_cents integer not null check(amount_cents>0 and amount_cents<=500),
 status text not null default 'reserved' check(status in ('reserved','applied','released')),
 stripe_invoice_id text unique, created_at timestamptz not null default now()
);
create index referral_codes_owner_idx on public.referral_codes(owner_id);
create index referral_attributions_referrer_idx on public.referral_attributions(referrer_user_id);
create index referral_receipts_user_idx on public.referral_receipts(referred_user_id);
create unique index referral_receipts_payment_idx on public.referral_receipts(payment_intent_id) where payment_intent_id is not null;
create unique index referral_lifetime_once_idx on public.referral_receipts(referred_user_id) where kind='lifetime';
create index affiliate_commissions_user_idx on public.affiliate_commissions(referrer_user_id);
create index subscriber_rewards_user_idx on public.subscriber_referral_rewards(referrer_user_id);
create index referral_redemptions_month_idx on public.referral_redemptions(user_id,billing_month);
alter table public.referral_program_settings enable row level security;
alter table public.affiliate_members enable row level security;
alter table public.referral_codes enable row level security;
alter table public.referral_attributions enable row level security;
alter table public.referral_receipts enable row level security;
alter table public.affiliate_commissions enable row level security;
alter table public.subscriber_referral_rewards enable row level security;
alter table public.referral_redemptions enable row level security;
revoke all on public.referral_program_settings,public.affiliate_members,public.referral_codes,public.referral_attributions,public.referral_receipts,public.affiliate_commissions,public.subscriber_referral_rewards,public.referral_redemptions from anon,authenticated;
grant all on public.referral_program_settings,public.affiliate_members,public.referral_codes,public.referral_attributions,public.referral_receipts,public.affiliate_commissions,public.subscriber_referral_rewards,public.referral_redemptions to service_role;
grant select on public.affiliate_members,public.referral_codes,public.referral_attributions,public.affiliate_commissions,public.subscriber_referral_rewards,public.referral_redemptions to authenticated;
create policy affiliate_member_own on public.affiliate_members for select to authenticated using((select auth.uid())=user_id and (select app_private.mfa_access_allowed()));
create policy referral_code_own on public.referral_codes for select to authenticated using((select auth.uid())=owner_id and (select app_private.mfa_access_allowed()));
create policy referral_attribution_own on public.referral_attributions for select to authenticated using(((select auth.uid())=referrer_user_id or (select auth.uid())=referred_user_id) and (select app_private.mfa_access_allowed()));
create policy affiliate_commission_own on public.affiliate_commissions for select to authenticated using((select auth.uid())=referrer_user_id and (select app_private.mfa_access_allowed()));
create policy subscriber_reward_own on public.subscriber_referral_rewards for select to authenticated using((select auth.uid())=referrer_user_id and (select app_private.mfa_access_allowed()));
create policy referral_redemption_own on public.referral_redemptions for select to authenticated using((select auth.uid())=user_id and (select app_private.mfa_access_allowed()));

create function public.attribute_referral(requested_user_id uuid,requested_code uuid,requested_joined_at timestamptz) returns boolean
language plpgsql security invoker set search_path=public,pg_temp as $$
declare code public.referral_codes%rowtype; settings public.referral_program_settings%rowtype; joined_at timestamptz;
begin
 perform pg_advisory_xact_lock(hashtextextended(requested_user_id::text,1410));
 select * into settings from public.referral_program_settings where id;
 select * into code from public.referral_codes where referral_codes.code=requested_code and active;
 if not found or code.owner_id=requested_user_id then return false; end if;
 if (code.channel='affiliate' and not settings.affiliate_enabled) or (code.channel='subscriber' and not settings.subscriber_enabled) then return false; end if;
 joined_at:=requested_joined_at;
 if joined_at is null or joined_at<settings.started_at then return false; end if;
 if exists(select 1 from public.subscriptions where user_id=requested_user_id)
    or exists(select 1 from public.lifetime_payments where user_id=requested_user_id and status='paid') then return false; end if;
 if code.channel='affiliate' and not exists(select 1 from public.affiliate_members where user_id=code.owner_id and status='approved') then return false; end if;
 insert into public.referral_attributions(referred_user_id,referrer_user_id,code,channel) values(requested_user_id,code.owner_id,code.code,code.channel) on conflict(referred_user_id) do nothing;
 return found;
end $$;
create function public.record_referral_receipt(requested_receipt_key text,requested_payment_intent_id text,requested_user_id uuid,requested_kind text,requested_paid_at timestamptz,requested_net_cents bigint)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare attribution public.referral_attributions%rowtype; settings public.referral_program_settings%rowtype; first_date timestamptz; rate integer;
begin
 if requested_net_cents<1 or requested_kind not in ('subscription','lifetime','maintenance') then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended(requested_user_id::text,1410));
 select * into attribution from public.referral_attributions where referred_user_id=requested_user_id for update;
 if not found then return false; end if;
 if exists(select 1 from public.referral_receipts where receipt_key=requested_receipt_key) then return false; end if;
 if requested_kind='lifetime' and exists(select 1 from public.referral_receipts where referred_user_id=requested_user_id and kind='lifetime') then return false; end if;
 select * into settings from public.referral_program_settings where id;
 insert into public.referral_receipts(receipt_key,payment_intent_id,referred_user_id,kind,paid_at,eligible_net_cents) values(requested_receipt_key,requested_payment_intent_id,requested_user_id,requested_kind,requested_paid_at,requested_net_cents);
 first_date:=least(coalesce(attribution.first_paid_at,requested_paid_at),requested_paid_at);
 update public.referral_attributions set first_paid_at=first_date where referred_user_id=requested_user_id;
 if attribution.channel='affiliate' and settings.affiliate_enabled and exists(select 1 from public.affiliate_members where user_id=attribution.referrer_user_id and status='approved' and approved_at<=requested_paid_at) then
  rate:=case when requested_kind='lifetime' then 750 else 1500 end;
  if requested_kind='lifetime' or (requested_kind='subscription' and requested_paid_at<first_date+interval '12 months') then
   insert into public.affiliate_commissions(receipt_key,referrer_user_id,amount_cents,rate_basis_points) values(requested_receipt_key,attribution.referrer_user_id,round(requested_net_cents*rate::numeric/10000),rate);
  end if;
 end if;
 -- Out-of-order delivery must not move the first-year window forward.
 update public.affiliate_commissions set amount_cents=0 where receipt_key in(select receipt_key from public.referral_receipts where referred_user_id=requested_user_id and kind='subscription' and paid_at>=first_date+interval '12 months');
 if attribution.channel='subscriber' and settings.subscriber_enabled and requested_kind<>'maintenance' then
  insert into public.subscriber_referral_rewards(referred_user_id,referrer_user_id,receipt_key,points) values(requested_user_id,attribution.referrer_user_id,requested_receipt_key,settings.points_per_referral) on conflict(referred_user_id) do nothing;
 end if;
 return true;
end $$;
create function public.refund_referral_receipt(requested_payment_intent_id text,requested_refunded_net_cents bigint) returns boolean
language plpgsql security invoker set search_path=public,pg_temp as $$
declare receipt public.referral_receipts%rowtype;
begin
 select * into receipt from public.referral_receipts where payment_intent_id=requested_payment_intent_id;
 if not found then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended(receipt.referred_user_id::text,1410));
 update public.referral_receipts set refunded_net_cents=least(eligible_net_cents,greatest(refunded_net_cents,requested_refunded_net_cents)) where receipt_key=receipt.receipt_key returning * into receipt;
 update public.affiliate_commissions set amount_cents=least(amount_cents,round((receipt.eligible_net_cents-receipt.refunded_net_cents)*rate_basis_points::numeric/10000)) where receipt_key=receipt.receipt_key;
 if receipt.refunded_net_cents>=receipt.eligible_net_cents then update public.subscriber_referral_rewards set revoked=true where receipt_key=receipt.receipt_key; end if;
 return true;
end $$;
create function public.reserve_referral_redemption(requested_user_id uuid,requested_points bigint,requested_month date) returns uuid
language plpgsql security invoker set search_path=public,pg_temp as $$
declare settings public.referral_program_settings%rowtype; balance bigint; used_cents bigint; amount bigint; reserved_id uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(requested_user_id::text,1411));
 select * into settings from public.referral_program_settings where id;
 if not settings.subscriber_enabled or settings.cents_per_point is null then raise exception 'REFERRALS_NOT_CONFIGURED'; end if;
 if requested_points<1 or extract(day from requested_month)<>1 then raise exception 'INVALID_REDEMPTION'; end if;
 select coalesce(sum(points),0) into balance from public.subscriber_referral_rewards where referrer_user_id=requested_user_id and not revoked;
 select balance-coalesce(sum(points),0) into balance from public.referral_redemptions where user_id=requested_user_id and status<>'released';
 amount:=requested_points*settings.cents_per_point;
 select coalesce(sum(amount_cents),0) into used_cents from public.referral_redemptions where user_id=requested_user_id and billing_month=requested_month and status<>'released';
 if balance<requested_points then raise exception 'INSUFFICIENT_REFERRAL_POINTS'; end if;
 if amount+used_cents>500 then raise exception 'MONTHLY_REFERRAL_CAP'; end if;
 insert into public.referral_redemptions(user_id,billing_month,points,amount_cents) values(requested_user_id,requested_month,requested_points,amount) returning id into reserved_id;
 return reserved_id;
end $$;
revoke all on function public.attribute_referral(uuid,uuid,timestamptz),public.record_referral_receipt(text,text,uuid,text,timestamptz,bigint),public.refund_referral_receipt(text,bigint),public.reserve_referral_redemption(uuid,bigint,date) from public,anon,authenticated;
grant execute on function public.attribute_referral(uuid,uuid,timestamptz),public.record_referral_receipt(text,text,uuid,text,timestamptz,bigint),public.refund_referral_receipt(text,bigint),public.reserve_referral_redemption(uuid,bigint,date) to service_role;
