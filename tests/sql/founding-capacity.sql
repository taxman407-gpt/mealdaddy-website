begin;
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000f01','founding-test@example.invalid');
set local role service_role;
insert into app_private.founding_license_slots(checkout_session_id,state,plan_key) select 'synthetic-seed-'||n,'purchased','byo' from generate_series(1,499)n;
insert into public.stripe_checkout_sessions(checkout_session_id,user_id,status) values('cs_synthetic_founding','00000000-0000-4000-8000-000000000f01','open');
insert into public.lifetime_checkout_quotes(checkout_session_id,user_id,plan_key,kind,price_id,amount_cents) values('cs_synthetic_founding','00000000-0000-4000-8000-000000000f01','byo','purchase','price_synthetic',25000);
do $$ begin
 if not (public.founding_license_availability()->>'counterVisible')::boolean or (public.founding_license_availability()->>'remaining')::int<>1501 then raise exception 'Always-visible purchase counter incorrect'; end if;
 if (public.founding_license_availability()->'plans'->'core'->>'remaining')::int<>2000 then raise exception 'BYOK purchases affected Standard capacity'; end if;
 perform public.record_lifetime_payment('00000000-0000-4000-8000-000000000f01','cs_synthetic_founding','pi_synthetic_founding','byo','purchase',25000,now());
 if not (public.founding_license_availability()->>'counterVisible')::boolean or (public.founding_license_availability()->>'remaining')::int<>1500 then raise exception 'Counter threshold failed'; end if;
 if public.record_lifetime_payment('00000000-0000-4000-8000-000000000f01','cs_synthetic_founding','pi_synthetic_founding','byo','purchase',25000,now()) then raise exception 'Replay counted twice'; end if;
end $$;
insert into app_private.founding_license_slots(checkout_session_id,state,plan_key) select 'synthetic-held-'||n,'held','byo' from generate_series(1,1499)n;
insert into public.stripe_checkout_sessions(checkout_session_id,user_id,status) values('cs_synthetic_final','00000000-0000-4000-8000-000000000f01','open'),('cs_synthetic_over','00000000-0000-4000-8000-000000000f01','open');
insert into public.lifetime_checkout_quotes(checkout_session_id,user_id,plan_key,kind,price_id,amount_cents) values('cs_synthetic_final','00000000-0000-4000-8000-000000000f01','byo','purchase','price_synthetic',25000);
do $$ begin
 begin
 insert into public.lifetime_checkout_quotes(checkout_session_id,user_id,plan_key,kind,price_id,amount_cents) values('cs_synthetic_over','00000000-0000-4000-8000-000000000f01','byo','purchase','price_synthetic',25000);
 raise exception 'Overselling allowed';
 exception when check_violation then null; end;
end $$;
update public.stripe_checkout_sessions set status='expired' where checkout_session_id='cs_synthetic_final';
do $$ begin
 if (select state from app_private.founding_license_slots where checkout_session_id='cs_synthetic_final')<>'released' then raise exception 'Expired hold not released'; end if;
 if (public.founding_license_availability()->>'remaining')::int<>1500 then raise exception 'Unpaid reservations changed purchase counter'; end if;
end $$;
update app_private.founding_license_slots set state='purchased' where checkout_session_id in (select 'synthetic-held-'||n from generate_series(1,1299)n);
do $$ begin
 if (public.founding_license_availability()->>'nearLimit')::boolean or (public.founding_license_availability()->>'remaining')::int<>201 then raise exception 'Near-limit fired early'; end if;
end $$;
update app_private.founding_license_slots set state='purchased' where checkout_session_id='synthetic-held-1300';
do $$ begin
 if not (public.founding_license_availability()->>'nearLimit')::boolean or (public.founding_license_availability()->>'remaining')::int<>200 then raise exception 'Near-limit 200 boundary failed'; end if;
end $$;
update app_private.founding_license_slots set state='purchased' where checkout_session_id like 'synthetic-held-%' or checkout_session_id='cs_synthetic_final';
update public.lifetime_payments set status='paid' where checkout_session_id='cs_synthetic_founding';
do $$ begin
 if not (public.founding_license_availability()->>'soldOut')::boolean or not (public.founding_license_availability()->>'nearLimit')::boolean then raise exception 'Sellout or near-limit not reported'; end if;
 perform public.record_lifetime_refund('pi_synthetic_founding',25000);
 if not (public.founding_license_availability()->>'soldOut')::boolean then raise exception 'Sold-out campaign reopened after refund'; end if;
end $$;
reset role;
set local role authenticated;
do $$ begin
 begin perform public.founding_license_availability(); raise exception 'Client accessed server aggregate'; exception when insufficient_privilege then null; end;
 begin perform count(*) from app_private.founding_license_slots; raise exception 'Client read private inventory'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: always-visible counter, independent plan capacity, 201/200 warning boundary, exactly 2,000 slots, replay, expired reservation, sticky sellout after refund, near-limit signal and client privilege rejection; synthetic rows rolled back' as result;
