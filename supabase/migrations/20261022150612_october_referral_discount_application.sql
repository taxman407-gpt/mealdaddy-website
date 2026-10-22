-- Preserve already-promised rewards when pausing new referrals.
alter table public.referral_attributions add column promised_points bigint check(promised_points>0);
alter table public.referral_attributions add column promised_cents_per_point integer check(promised_cents_per_point>0);
update public.referral_attributions a set promised_points=s.points_per_referral,promised_cents_per_point=s.cents_per_point from public.referral_program_settings s where a.channel='subscriber' and s.id;
alter table public.referral_attributions add constraint subscriber_referral_promise_required check(channel<>'subscriber' or (promised_points is not null and promised_cents_per_point is not null));
create or replace function public.attribute_referral(requested_user_id uuid,requested_code uuid,requested_joined_at timestamptz) returns boolean
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
 insert into public.referral_attributions(referred_user_id,referrer_user_id,code,channel,promised_points,promised_cents_per_point) values(requested_user_id,code.owner_id,code.code,code.channel,case when code.channel='subscriber' then settings.points_per_referral end,case when code.channel='subscriber' then settings.cents_per_point end) on conflict(referred_user_id) do nothing;
 return found;
end $$;
alter table public.referral_receipts add column collected_gross_cents bigint;
alter table public.referral_receipts add column payment_gross_cents bigint;
update public.referral_receipts set collected_gross_cents=eligible_net_cents,payment_gross_cents=eligible_net_cents;
alter table public.referral_receipts alter column collected_gross_cents set not null;
alter table public.referral_receipts alter column payment_gross_cents set not null;
alter table public.referral_receipts add constraint referral_receipt_gross_valid check(collected_gross_cents>0 and payment_gross_cents>=collected_gross_cents and eligible_net_cents<=collected_gross_cents);
drop index public.referral_receipts_payment_idx;
create index referral_receipts_payment_idx on public.referral_receipts(payment_intent_id);
create or replace function public.record_referral_receipt(requested_receipt_key text,requested_payment_intent_id text,requested_user_id uuid,requested_kind text,requested_paid_at timestamptz,requested_net_cents bigint,requested_collected_gross_cents bigint,requested_payment_gross_cents bigint)
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
 insert into public.referral_receipts(receipt_key,payment_intent_id,referred_user_id,kind,paid_at,eligible_net_cents,collected_gross_cents,payment_gross_cents) values(requested_receipt_key,requested_payment_intent_id,requested_user_id,requested_kind,requested_paid_at,requested_net_cents,requested_collected_gross_cents,requested_payment_gross_cents);
 first_date:=least(coalesce(attribution.first_paid_at,requested_paid_at),requested_paid_at);
 update public.referral_attributions set first_paid_at=first_date where referred_user_id=requested_user_id;
 if attribution.channel='affiliate' and exists(select 1 from public.affiliate_members where user_id=attribution.referrer_user_id and status='approved' and approved_at<=requested_paid_at) then
  rate:=case when requested_kind='lifetime' then 750 else 1500 end;
  if requested_kind='lifetime' or (requested_kind='subscription' and requested_paid_at<first_date+interval '12 months') then
   insert into public.affiliate_commissions(receipt_key,referrer_user_id,amount_cents,rate_basis_points) values(requested_receipt_key,attribution.referrer_user_id,round(requested_net_cents*rate::numeric/10000),rate);
  end if;
 end if;
 -- Out-of-order delivery must not move the first-year window forward.
 update public.affiliate_commissions set amount_cents=0 where receipt_key in(select receipt_key from public.referral_receipts where referred_user_id=requested_user_id and kind='subscription' and paid_at>=first_date+interval '12 months');
 if attribution.channel='subscriber' and attribution.promised_points is not null and requested_kind<>'maintenance' then
  insert into public.subscriber_referral_rewards(referred_user_id,referrer_user_id,receipt_key,points) values(requested_user_id,attribution.referrer_user_id,requested_receipt_key,attribution.promised_points) on conflict(referred_user_id) do update set receipt_key=excluded.receipt_key
    where exists(select 1 from public.referral_receipts prior_receipt where prior_receipt.receipt_key=subscriber_referral_rewards.receipt_key and prior_receipt.paid_at>requested_paid_at);
 end if;
 return true;
end $$;

create or replace function public.record_referral_receipt(requested_receipt_key text,requested_payment_intent_id text,requested_user_id uuid,requested_kind text,requested_paid_at timestamptz,requested_net_cents bigint)
returns boolean language sql security invoker set search_path=public,pg_temp as $$
 select public.record_referral_receipt(requested_receipt_key,requested_payment_intent_id,requested_user_id,requested_kind,requested_paid_at,requested_net_cents,requested_net_cents,requested_net_cents);
$$;
revoke all on function public.record_referral_receipt(text,text,uuid,text,timestamptz,bigint,bigint,bigint) from public,anon,authenticated;
grant execute on function public.record_referral_receipt(text,text,uuid,text,timestamptz,bigint,bigint,bigint) to service_role;
create or replace function public.reserve_referral_redemption(requested_user_id uuid,requested_points bigint,requested_month date) returns uuid
language plpgsql security invoker set search_path=public,pg_temp as $$
declare settings public.referral_program_settings%rowtype; balance bigint; used_cents bigint; amount bigint; reserved_id uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(requested_user_id::text,1411));
 select * into settings from public.referral_program_settings where id;
 if settings.cents_per_point is null then raise exception 'REFERRALS_NOT_CONFIGURED'; end if;
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

alter table public.referral_redemptions add column stripe_invoice_item_id text;
create function public.claim_referral_invoice_discount(requested_user_id uuid,requested_invoice_id text,requested_month date,requested_max_cents integer)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare settings public.referral_program_settings%rowtype; redemption public.referral_redemptions%rowtype; used_cents bigint; use_cents bigint; use_points bigint; claimable_points bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended(requested_user_id::text,1411));
 select * into redemption from public.referral_redemptions where stripe_invoice_id=requested_invoice_id;
 if found then
  if redemption.user_id<>requested_user_id then raise exception 'REFERRAL_INVOICE_OWNER_CONFLICT'; end if;
  if redemption.status='released' then return null; end if;
  return to_jsonb(redemption);
 end if;
 select * into settings from public.referral_program_settings where id;
 if settings.cents_per_point is null or requested_max_cents<1 then return null; end if;
 select coalesce(sum(r.amount_cents),0) into used_cents from public.referral_redemptions r where r.user_id=requested_user_id and r.billing_month=requested_month and r.stripe_invoice_id is not null and r.status<>'released';
 select * into redemption from public.referral_redemptions where user_id=requested_user_id and status='reserved' and stripe_invoice_id is null order by created_at,id limit 1 for update;
 if not found then return null; end if;
 select coalesce(sum(r.points),0) into claimable_points from public.subscriber_referral_rewards r where r.referrer_user_id=requested_user_id and not r.revoked;
 select claimable_points-coalesce(sum(r.points),0) into claimable_points from public.referral_redemptions r where r.user_id=requested_user_id and r.status<>'released' and r.stripe_invoice_id is not null;
 use_cents:=least(500-used_cents,requested_max_cents,redemption.amount_cents,greatest(claimable_points,0)*settings.cents_per_point);
 use_points:=floor(use_cents/settings.cents_per_point);
 if use_points<1 then return null; end if;
 use_cents:=use_points*settings.cents_per_point;
 if use_points<redemption.points then
  insert into public.referral_redemptions(user_id,billing_month,points,amount_cents) values(requested_user_id,redemption.billing_month,redemption.points-use_points,redemption.amount_cents-use_cents);
 end if;
 update public.referral_redemptions set points=use_points,amount_cents=use_cents,billing_month=requested_month,stripe_invoice_id=requested_invoice_id where id=redemption.id returning * into redemption;
 return to_jsonb(redemption);
end $$;
revoke all on function public.claim_referral_invoice_discount(uuid,text,date,integer) from public,anon,authenticated;
grant execute on function public.claim_referral_invoice_discount(uuid,text,date,integer) to service_role;

create function public.refund_referral_payment(requested_payment_intent_id text,requested_refunded_gross_cents bigint) returns boolean
language plpgsql security invoker set search_path=public,pg_temp as $$
declare receipt public.referral_receipts%rowtype; referrer uuid; refunded bigint; changed boolean:=false;
begin
 for receipt in select * from public.referral_receipts where payment_intent_id=requested_payment_intent_id order by referred_user_id,receipt_key loop
  perform pg_advisory_xact_lock(hashtextextended(receipt.referred_user_id::text,1410));
  select referrer_user_id into referrer from public.referral_attributions where referred_user_id=receipt.referred_user_id;
  if referrer is not null then perform pg_advisory_xact_lock(hashtextextended(referrer::text,1411)); end if;
  refunded:=floor(receipt.eligible_net_cents::numeric*least(greatest(requested_refunded_gross_cents,0),receipt.payment_gross_cents)/receipt.payment_gross_cents);
  update public.referral_receipts set refunded_net_cents=greatest(refunded_net_cents,refunded) where receipt_key=receipt.receipt_key returning * into receipt;
  update public.affiliate_commissions set amount_cents=least(amount_cents,round((receipt.eligible_net_cents-receipt.refunded_net_cents)*rate_basis_points::numeric/10000)) where receipt_key=receipt.receipt_key;
  if not exists(select 1 from public.referral_receipts remaining_receipt where remaining_receipt.referred_user_id=receipt.referred_user_id and remaining_receipt.eligible_net_cents>remaining_receipt.refunded_net_cents) then update public.subscriber_referral_rewards set revoked=true where referred_user_id=receipt.referred_user_id; end if;
  changed:=true;
 end loop;
 return changed;
end $$;
revoke all on function public.refund_referral_payment(text,bigint) from public,anon,authenticated;
grant execute on function public.refund_referral_payment(text,bigint) to service_role;
