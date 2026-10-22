begin;
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000c01','lifetime-a@example.invalid'),('00000000-0000-4000-8000-000000000c02','lifetime-b@example.invalid');
set local role service_role;
do $$ begin
 if not public.record_lifetime_payment('00000000-0000-4000-8000-000000000c01','cs_synthetic_purchase','pi_synthetic_purchase','core','purchase',35000,'2026-10-22T12:00:00Z') then raise exception 'Purchase not applied'; end if;
 if public.record_lifetime_payment('00000000-0000-4000-8000-000000000c01','cs_synthetic_purchase','pi_synthetic_purchase','core','purchase',35000,'2026-10-22T12:00:00Z') then raise exception 'Replay applied twice'; end if;
 if not public.record_lifetime_payment('00000000-0000-4000-8000-000000000c01','cs_synthetic_renewal','pi_synthetic_renewal','core','maintenance',6000,'2033-01-01T12:00:00Z') then raise exception 'Reactivation failed'; end if;
 if (select maintenance_paid_through from public.lifetime_licenses where user_id='00000000-0000-4000-8000-000000000c01')<>'2034-01-01T12:00:00Z' then raise exception 'Reactivation charged skipped years or gave wrong term'; end if;
 if not public.record_lifetime_refund('pi_synthetic_renewal',6000) then raise exception 'Refund not recorded'; end if;
 if public.record_lifetime_refund('pi_synthetic_renewal',6000) then raise exception 'Refund replay applied twice'; end if;
 if (select status from public.lifetime_licenses where user_id='00000000-0000-4000-8000-000000000c01')<>'reconciliation_required' then raise exception 'Maintenance refund did not require reconciliation'; end if;
 perform public.record_lifetime_refund('pi_synthetic_purchase',35000);
 if (select status from public.lifetime_licenses where user_id='00000000-0000-4000-8000-000000000c01')<>'refunded' then raise exception 'Refunded purchase still active'; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c02","role":"authenticated","aal":"aal1"}',true);
do $$ begin
 if exists(select 1 from public.lifetime_licenses) or exists(select 1 from public.lifetime_payments) then raise exception 'Cross-account license access'; end if;
 begin
  perform public.record_lifetime_payment('00000000-0000-4000-8000-000000000c02','cs_forged','pi_forged','core','purchase',1,now());
  raise exception 'Client forged paid license';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.lifetime_licenses(user_id,plan_key,status,purchased_at,maintenance_paid_through) values('00000000-0000-4000-8000-000000000c02','core','paid',now(),now());
  raise exception 'Client inserted license';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000c01","role":"authenticated","aal":"aal1"}',true);
do $$ begin
 if (select count(*) from public.lifetime_licenses)<>1 or (select count(*) from public.lifetime_payments)<>2 then raise exception 'Own license read failed'; end if;
end $$;
reset role;
rollback;
select 'PASS: purchase, replay idempotency, late reactivation without back fees, refund replay and access reconciliation, cross-account isolation and forged access rejected; fixtures rolled back' as result;
