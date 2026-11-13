-- Applied to production using Supabase migration version 20261108180425.
-- Family access uses Standard/core regardless of a previous beta BYOK plan.
-- Authentication identities, application records, Stripe checks and audit events are preserved.
CREATE OR REPLACE FUNCTION public.set_complimentary_family_access(
  requested_user_id uuid,
  requested_action text,
  requested_by uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  current_status text;
BEGIN
  IF requested_action IS NULL OR requested_action NOT IN ('grant', 'revoke') THEN
    RAISE EXCEPTION 'Unknown complimentary access action';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('complimentary-family:' || requested_user_id::text, 0));

  IF requested_action = 'grant' THEN
    IF EXISTS (
      SELECT 1 FROM public.subscriptions
      WHERE user_id = requested_user_id
        AND status IN ('trialing', 'active', 'past_due', 'unpaid')
    ) THEN
      RAISE EXCEPTION 'A current Stripe membership already exists';
    END IF;

    INSERT INTO public.complimentary_access_grants (
      user_id, access_type, status, plan_key, granted_by,
      granted_at, revoked_at, updated_at
    ) VALUES (
      requested_user_id, 'family', 'active', 'core', requested_by,
      now(), NULL, now()
    )
    ON CONFLICT (user_id) DO UPDATE
      SET access_type = 'family',
          status = 'active',
          plan_key = 'core',
          granted_by = excluded.granted_by,
          granted_at = now(),
          revoked_at = NULL,
          updated_at = now();

    INSERT INTO public.complimentary_access_events (user_id, action, performed_by)
    VALUES (requested_user_id, 'granted', requested_by);
    RETURN 'active';
  END IF;

  SELECT status INTO current_status
  FROM public.complimentary_access_grants
  WHERE user_id = requested_user_id
  FOR UPDATE;
  IF current_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Complimentary family access is not active';
  END IF;

  UPDATE public.complimentary_access_grants
  SET status = 'revoked', revoked_at = now(), updated_at = now()
  WHERE user_id = requested_user_id;

  INSERT INTO public.complimentary_access_events (user_id, action, performed_by)
  VALUES (requested_user_id, 'revoked', requested_by);
  RETURN 'revoked';
END;
$function$;

REVOKE ALL ON FUNCTION public.set_complimentary_family_access(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_complimentary_family_access(uuid, text, uuid) TO service_role;
COMMENT ON FUNCTION public.set_complimentary_family_access(uuid, text, uuid) IS 'Server-only family entitlement change. Grant normalizes plan_key to core and preserves the existing user ID and application records. Owner authorization and MFA are enforced by manage-family-access.';
