-- Existing promises retain their qualification rule; new referrals require two payments.
alter table public.referral_attributions add column required_payments integer not null default 1 check(required_payments in (1,2));
alter table public.referral_attributions alter column required_payments set default 2;
-- Configure the agreed $5 as 500 one-cent points only when values are still unset.
-- Program activation is deliberately unchanged.
update public.referral_program_settings set points_per_referral=500,cents_per_point=1
where id and points_per_referral is null and cents_per_point is null;

create function app_private.reconcile_subscriber_reward(requested_user_id uuid) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
declare attribution public.referral_attributions%rowtype; qualifying_receipt text;
begin
 perform pg_advisory_xact_lock(hashtextextended(requested_user_id::text,1410));
 select * into attribution from public.referral_attributions where referred_user_id=requested_user_id;
 if not found or attribution.channel<>'subscriber' or attribution.promised_points is null then return; end if;
 perform pg_advisory_xact_lock(hashtextextended(attribution.referrer_user_id::text,1411));
 -- Multiple payment allocations of one invoice count as one qualifying purchase.
 -- Maintenance stays excluded until the owner defines lifetime-purchaser qualification.
 select receipt_key into qualifying_receipt from (
  select min(receipt_key) as receipt_key,min(paid_at) as paid_at
  from public.referral_receipts
  where referred_user_id=requested_user_id and kind<>'maintenance'
    and eligible_net_cents>refunded_net_cents
  group by case when receipt_key like 'invoice:%' then 'invoice:'||split_part(receipt_key,':',2)
    else coalesce(payment_intent_id,receipt_key) end
 ) qualifying order by paid_at,receipt_key offset (attribution.required_payments-1) limit 1;
 if qualifying_receipt is null then
  update public.subscriber_referral_rewards set revoked=true where referred_user_id=requested_user_id;
 else
  insert into public.subscriber_referral_rewards(referred_user_id,referrer_user_id,receipt_key,points)
  values(requested_user_id,attribution.referrer_user_id,qualifying_receipt,attribution.promised_points)
  on conflict(referred_user_id) do update set receipt_key=excluded.receipt_key,revoked=false;
 end if;
end $$;
revoke all on function app_private.reconcile_subscriber_reward(uuid) from public,anon,authenticated;
grant execute on function app_private.reconcile_subscriber_reward(uuid) to service_role;

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
 perform app_private.reconcile_subscriber_reward(requested_user_id);
 return true;
end $$;

create or replace function public.refund_referral_payment(requested_payment_intent_id text,requested_refunded_gross_cents bigint) returns boolean
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
  perform app_private.reconcile_subscriber_reward(receipt.referred_user_id);
  changed:=true;
 end loop;
 return changed;
end $$;
revoke all on function public.refund_referral_payment(text,bigint) from public,anon,authenticated;
grant execute on function public.refund_referral_payment(text,bigint) to service_role;
