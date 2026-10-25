# Welcome delivery verification

The isolated test project (`dkirmzthyynogkkaacmj`) successfully sent one welcome message to Resend's `delivered@resend.dev` test sink at 2026-10-25 02:11:59 UTC. Resend recorded delivery for message `01a170d4-3b3c-7efb-ad3b-d0b5fd98b704`. A repeated worker invocation processed zero messages. This confirms the provider integration and duplicate suppression; it does not establish real-inbox deliverability.

Modern project secret keys authenticate through the `apikey` header and exact comparison against the runtime's `SUPABASE_SECRET_KEYS`. Legacy service-role bearer credentials remain supported. Gateway JWT verification is disabled only for this worker because modern API keys are not JWTs; application authorization runs before settings, database access, or provider calls. Missing, forged, publishable, and wrong-project credentials are rejected.

The scheduler accepts a modern secret key in the existing `WELCOME_SERVICE_ROLE_KEY` GitHub secret; it selects the appropriate header from the key format. Keep this secret server-side. Production was not deployed or enabled by this verification. The test sending controls were returned to disabled after the test.

Validation: the complete `npm test` suite passed, including authorization, processor, and scheduler tests. The first synthetic fixture attempt failed account validation before provider submission; the repaired fixture then sent once. The original legacy-key/runtime mismatch was not independently explained.
