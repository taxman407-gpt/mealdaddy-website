BEGIN;
INSERT INTO auth.users(id,email) VALUES ('00000000-0000-4000-8000-000000000a01','october-a@example.invalid'), ('00000000-0000-4000-8000-000000000b02','october-b@example.invalid');
INSERT INTO public.ledger_entries(user_id,client_request_id,kind,occurred_at,description) VALUES ('00000000-0000-4000-8000-000000000a01',gen_random_uuid(),'meal',now(),'RLS synthetic A'),('00000000-0000-4000-8000-000000000b02',gen_random_uuid(),'meal',now(),'RLS synthetic B');
INSERT INTO public.profiles(user_id,diet_style,coaching_tone) VALUES ('00000000-0000-4000-8000-000000000a01','Flexible','supportive'), ('00000000-0000-4000-8000-000000000b02','Flexible','supportive');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000a01","role":"authenticated","aal":"aal1"}',true);
DO $$ DECLARE n integer; BEGIN
 SELECT count(*) INTO n FROM public.ledger_entries; IF n <> 1 THEN RAISE EXCEPTION 'Cross-account meal read isolation failed'; END IF;
 SELECT count(*) INTO n FROM public.profiles; IF n <> 1 THEN RAISE EXCEPTION 'Cross-account profile read isolation failed'; END IF;
 UPDATE public.ledger_entries SET description='forbidden' WHERE user_id='00000000-0000-4000-8000-000000000b02'; GET DIAGNOSTICS n=ROW_COUNT; IF n<>0 THEN RAISE EXCEPTION 'Cross-account update succeeded'; END IF;
 DELETE FROM public.ledger_entries WHERE user_id='00000000-0000-4000-8000-000000000b02'; GET DIAGNOSTICS n=ROW_COUNT; IF n<>0 THEN RAISE EXCEPTION 'Cross-account delete succeeded'; END IF;
 BEGIN
 INSERT INTO public.ledger_entries(user_id,client_request_id,kind,occurred_at,description) VALUES('00000000-0000-4000-8000-000000000b02',gen_random_uuid(),'meal',now(),'forbidden');
 RAISE EXCEPTION 'Cross-account insert succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
 UPDATE public.ledger_entries SET user_id='00000000-0000-4000-8000-000000000b02';
 RAISE EXCEPTION 'Ownership reassignment succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 UPDATE public.ledger_entries SET description='own edit'; GET DIAGNOSTICS n=ROW_COUNT; IF n<>1 THEN RAISE EXCEPTION 'Own edit failed'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS: cross-account meal/profile reads, insert/update/delete, ownership reassignment, own update; all fixtures rolled back' AS result;
