begin;
-- Synthetic identities only; all changes rolled back.
insert into auth.users(id,email) values
('00000000-0000-4000-8000-00000000c101','referrer-second@example.invalid'),
('00000000-0000-4000-8000-00000000c102','referred-second@example.invalid');
set local role service_role;
insert into public.referral_codes(code,owner_id,channel) values
('00000000-0000-4000-8000-00000000c103','00000000-0000-4000-8000-00000000c101','subscriber');
insert into public.referral_attributions(referred_user_id,referrer_user_id,code,channel,promised_points,promised_cents_per_point) values
('00000000-0000-4000-8000-00000000c102','00000000-0000-4000-8000-00000000c101','00000000-0000-4000-8000-00000000c103','subscriber',500,1);
do $$ declare u uuid:='00000000-0000-4000-8000-00000000c102'; begin
 if (select required_payments from public.referral_attributions where referred_user_id=u)<>2 then raise exception 'New referral does not require two payments'; end if;
 perform public.record_referral_receipt('invoice:in_one:pi_one','pi_one',u,'subscription','2026-10-01',300);
 if exists(select 1 from public.subscriber_referral_rewards where referred_user_id=u) then raise exception 'Reward on first payment'; end if;
 perform public.record_referral_receipt('invoice:in_one:pi_split','pi_split',u,'subscription','2026-10-01',300);
 if exists(select 1 from public.subscriber_referral_rewards where referred_user_id=u) then raise exception 'Split invoice counted twice'; end if;
 perform public.record_referral_receipt('invoice:in_two:pi_two','pi_two',u,'subscription','2026-11-01',699);
 if not exists(select 1 from public.subscriber_referral_rewards where referred_user_id=u and points=500 and not revoked) then raise exception 'Second payment did not award $5'; end if;
 if public.record_referral_receipt('invoice:in_two:pi_two','pi_two',u,'subscription','2026-11-01',699) then raise exception 'Replay accepted'; end if;
 perform public.refund_referral_payment('pi_two',699);
 if not (select revoked from public.subscriber_referral_rewards where referred_user_id=u) then raise exception 'Refund below threshold did not revoke'; end if;
 perform public.record_referral_receipt('invoice:in_three:pi_three','pi_three',u,'subscription','2026-12-01',699);
 if (select revoked from public.subscriber_referral_rewards where referred_user_id=u) then raise exception 'Later qualifying payment did not restore'; end if;
 if (select count(*) from public.subscriber_referral_rewards where referred_user_id=u)<>1 then raise exception 'Duplicate award'; end if;
 perform public.refund_referral_payment('pi_one',300);
 if (select revoked from public.subscriber_referral_rewards where referred_user_id=u) then raise exception 'Partially retained first invoice should qualify'; end if;
 perform public.refund_referral_payment('pi_split',300);
 if not (select revoked from public.subscriber_referral_rewards where referred_user_id=u) then raise exception 'Fully refunded first invoice still qualifies'; end if;
end $$;
reset role;
set local role authenticated;
do $$ begin
 begin
  perform app_private.reconcile_subscriber_reward('00000000-0000-4000-8000-00000000c102');
  raise exception 'Member can forge rewards';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: second payment, split invoice, replay, refund, restoration, once-only reward and client denial; rolled back' as result;
