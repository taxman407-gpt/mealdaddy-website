-- The beta frontend uses the authenticated Edge Function, not a client-callable identity RPC.
-- Keep identity lookup in the private schema, accessible only to trusted server callers.
drop function public.beta_access();
