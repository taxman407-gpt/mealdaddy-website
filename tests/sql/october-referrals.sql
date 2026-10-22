begin;
insert into auth.users(id,email) values
('00000000-0000-4000-8000-00000000a101','affiliate@example.invalid'),
('00000000-0000-4000-8000-00000000a102','monthly@example.invalid'),
('00000000-0000-4000-8000-00000000a103','standard-lifetime@example.invalid'),
('00000000-0000-4000-8000-00000000a104','byok-lifetime@example.invalid'),
('00000000-0000-4000-8000-00000000a105','subscriber-referrer@example.invalid'),
('00000000-0000-4000-8000-00000000a106','subscriber-customer@example.invalid'),
('00000000-0000-4000-8000-00000000a107','subscriber-refund@example.invalid'),
('00000000-0000-4000-8000-00000000a108','out-of-order@example.invalid');
set local role service_role;
update public.referral_program_settings set affiliate_enabled=true,subscriber_enabled=true,started_at='2026-01-01',points_per_referral=1000,cents_per_point=1 where id;
insert into public.affiliate_members(user_id,status,approved_at) values('00000000-0000-4000-8000-00000000a101','approved','2026-01-01');
insert into public.referral_codes(code,owner_id,channel) values('00000000-0000-4000-8000-00000000b101','00000000-0000-4000-8000-00000000a101','affiliate'),('00000000-0000-4000-8000-00000000b105','00000000-0000-4000-8000-00000000a105','subscriber');
do $$ declare u uuid; first_redemption uuid; begin
 foreach u in array array['00000000-0000-4000-8000-00000000a102'::uuid,'00000000-0000-4000-8000-00000000a103'::uuid,'00000000-0000-4000-8000-00000000a104'::uuid,'00000000-0000-4000-8000-00000000a108'::uuid] loop
  if not public.attribute_referral(u,'00000000-0000-4000-8000-00000000b101','2026-10-22') then raise exception 'Affiliate attribution failed'; end if;
 end loop;
 if public.attribute_referral('00000000-0000-4000-8000-00000000a101','00000000-0000-4000-8000-00000000b101','2026-10-22') then raise exception 'Self referral accepted'; end if;
 update public.referral_program_settings set affiliate_enabled=false where id;
 perform public.record_referral_receipt('invoice:first','pi:first','00000000-0000-4000-8000-00000000a102','subscription','2026-10-22T12:00:00Z',999);
 if public.record_referral_receipt('invoice:first','pi:first','00000000-0000-4000-8000-00000000a102','subscription','2026-10-22T12:00:00Z',999) then raise exception 'Receipt replay accepted'; end if;
 perform public.record_referral_receipt('invoice:renew','pi:renew','00000000-0000-4000-8000-00000000a102','subscription','2026-11-22T12:00:00Z',699);
 perform public.record_referral_receipt('invoice:after-year','pi:after-year','00000000-0000-4000-8000-00000000a102','subscription','2027-10-22T12:00:00Z',999);
 if (select amount_cents from public.affiliate_commissions where receipt_key='invoice:first')<>150 then raise exception 'Wrong 15 percent commission'; end if;
 if exists(select 1 from public.affiliate_commissions where receipt_key='invoice:after-year') then raise exception 'Commission after first year'; end if;
 perform public.record_referral_receipt('lifetime:standard','pi:standard','00000000-0000-4000-8000-00000000a103','lifetime','2026-10-22T12:00:00Z',35000);
 perform public.record_referral_receipt('lifetime:byok','pi:byok','00000000-0000-4000-8000-00000000a104','lifetime','2026-10-22T12:00:00Z',25000);
 if (select amount_cents from public.affiliate_commissions where receipt_key='lifetime:standard')<>2625 or (select amount_cents from public.affiliate_commissions where receipt_key='lifetime:byok')<>1875 then raise exception 'Wrong lifetime commission'; end if;
 if public.record_referral_receipt('lifetime:duplicate','pi:duplicate','00000000-0000-4000-8000-00000000a103','lifetime','2026-11-22',35000) then raise exception 'Second lifetime commission accepted'; end if;
 perform public.record_referral_receipt('invoice:late-first','pi:late-first','00000000-0000-4000-8000-00000000a108','subscription','2028-10-22',999);
 perform public.record_referral_receipt('invoice:early-arrives','pi:early-arrives','00000000-0000-4000-8000-00000000a108','subscription','2026-10-22',999);
 if (select amount_cents from public.affiliate_commissions where receipt_key='invoice:late-first')<>0 then raise exception 'Out-of-order delivery moved eligibility window'; end if;
 perform public.attribute_referral('00000000-0000-4000-8000-00000000a106','00000000-0000-4000-8000-00000000b105','2026-10-22');
 perform public.attribute_referral('00000000-0000-4000-8000-00000000a107','00000000-0000-4000-8000-00000000b105','2026-10-22');
 update public.referral_program_settings set subscriber_enabled=false where id;
 perform public.record_referral_receipt('reward:first','pi:reward-first','00000000-0000-4000-8000-00000000a106','subscription','2026-10-22',999);
 perform public.record_referral_receipt('reward:renew','pi:reward-renew','00000000-0000-4000-8000-00000000a106','subscription','2026-11-22',999);
 if (select count(*) from public.subscriber_referral_rewards where referred_user_id='00000000-0000-4000-8000-00000000a106')<>1 then raise exception 'Reward duplicated on renewal'; end if;
 perform public.record_referral_receipt('reward:refund','pi:reward-refund','00000000-0000-4000-8000-00000000a107','lifetime','2026-10-22',25000);
 perform public.refund_referral_receipt('pi:reward-refund',25000);
 if not (select revoked from public.subscriber_referral_rewards where referred_user_id='00000000-0000-4000-8000-00000000a107') then raise exception 'Refund did not revoke points'; end if;
 first_redemption:=public.reserve_referral_redemption('00000000-0000-4000-8000-00000000a105',300,'2026-10-01');
 begin
  perform public.reserve_referral_redemption('00000000-0000-4000-8000-00000000a105',250,'2026-10-01');
  raise exception 'Monthly cap bypassed';
 exception when raise_exception then if sqlerrm<>'MONTHLY_REFERRAL_CAP' then raise; end if; end;
 perform public.reserve_referral_redemption('00000000-0000-4000-8000-00000000a105',200,'2026-10-01');
 if (select sum(amount_cents) from public.referral_redemptions where user_id='00000000-0000-4000-8000-00000000a105')<>500 then raise exception 'Wrong cap total'; end if;
 if (public.claim_referral_invoice_discount('00000000-0000-4000-8000-00000000a105','in:discount-first','2026-11-01',150)->>'amount_cents')::integer<>150 then raise exception 'Partial invoice discount wrong'; end if;
 if (public.claim_referral_invoice_discount('00000000-0000-4000-8000-00000000a105','in:discount-first','2026-11-01',150)->>'amount_cents')::integer<>150 then raise exception 'Discount replay changed amount'; end if;
 perform public.claim_referral_invoice_discount('00000000-0000-4000-8000-00000000a105','in:discount-second','2026-11-01',500);
 perform public.claim_referral_invoice_discount('00000000-0000-4000-8000-00000000a105','in:discount-third','2026-11-01',500);
 if (select sum(amount_cents) from public.referral_redemptions where user_id='00000000-0000-4000-8000-00000000a105' and billing_month='2026-11-01' and stripe_invoice_id is not null)<>500 then raise exception 'Discount application cap or split wrong'; end if;
 perform public.reserve_referral_redemption('00000000-0000-4000-8000-00000000a105',300,'2026-12-01');
 if public.claim_referral_invoice_discount('00000000-0000-4000-8000-00000000a105','in:over-cap','2026-11-01',500) is not null then raise exception 'Applied monthly discount cap bypassed'; end if;
 perform public.record_referral_receipt('split:one','pi:shared','00000000-0000-4000-8000-00000000a102','subscription','2026-12-22',500,550,1100);
 perform public.record_referral_receipt('split:two','pi:shared','00000000-0000-4000-8000-00000000a102','subscription','2026-12-22',500,550,1100);
 perform public.refund_referral_payment('pi:shared',550);
 if (select count(*) from public.referral_receipts where payment_intent_id='pi:shared' and refunded_net_cents=250)<>2 then raise exception 'Split-payment refund allocation wrong'; end if;
 perform public.refund_referral_payment('pi:shared',1100);
 if (select sum(amount_cents) from public.affiliate_commissions where receipt_key in ('split:one','split:two'))<>0 then raise exception 'Full split-payment refund failed'; end if;
 perform public.refund_referral_payment('pi:reward-first',999);
 if (select revoked from public.subscriber_referral_rewards where referred_user_id='00000000-0000-4000-8000-00000000a106') then raise exception 'Points revoked despite retained qualifying payment'; end if;
 perform public.refund_referral_payment('pi:reward-renew',999);
 if not (select revoked from public.subscriber_referral_rewards where referred_user_id='00000000-0000-4000-8000-00000000a106') then raise exception 'Fully refunded referral points remain valid'; end if;
 if public.claim_referral_invoice_discount('00000000-0000-4000-8000-00000000a105','in:refunded-points','2027-01-01',500) is not null then raise exception 'Refunded points applied to another invoice'; end if;
 perform public.refund_referral_receipt('pi:first',999);
 if (select amount_cents from public.affiliate_commissions where receipt_key='invoice:first')<>0 then raise exception 'Refund did not reverse commission'; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000a105","role":"authenticated","aal":"aal1"}',true);
do $$ begin
 if exists(select 1 from public.affiliate_commissions) then raise exception 'Cross-account commission read'; end if;
 begin
  perform public.record_referral_receipt('forged','pi:forged','00000000-0000-4000-8000-00000000a105','subscription',now(),999);
  raise exception 'Client forged rewards';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: affiliate approval/rates/window/lifetime once, webhook replay, out-of-order delivery, subscriber once, honored promises after pause, refunds, partial invoice credit/replay, $5 cap and client isolation; all synthetic configuration rolled back' as result;
