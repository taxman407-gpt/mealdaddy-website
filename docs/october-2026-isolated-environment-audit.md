# October 2026 isolated environment audit — 2026-10-21

## Isolation
- GitHub branch: feature/october-2026-upgrade; production main untouched.
- Supabase TEST project: dkirmzthyynogkkaacmj (mealdaddy-october-test, us-east-1). Not a Supabase database branch; separate project. Quoted $0/month.
- Production Supabase: egbieqvbwniaxgqjzqkp. Inspected metadata only; no production writes.
- Test DB has 21 public application tables, all with RLS enabled; 39 policies; 0 meal entries, 0 profiles, 0 owner accounts.
- Applied core schema bootstrap based on read-only production metadata because initial repository migration assumed preexisting profiles/ledger_entries. Followed by repository migrations through replace_edited_meal_calculation. Reconstructed equivalent owner-RLS policy migration when original migration execution was blocked; verified policy existence.
- The production-only 20261008004539 email-contact grant migration file was absent from GitHub. Compared grants read-only and revoked authenticated DELETE in test to align its privileges with production. This was a TEST-only action.
- Supabase security advisor: 10 INFO findings for RLS-enabled tables without direct policies, consistent with server-only tables. Needs explicit review; not a clean-bill-of-health claim.
- Test project has no deployed Edge Functions or test credentials yet. Do not point production Worker to test project or vice versa.

## Outstanding gates
1. Review baseline schema reconstruction and migration drift before release; commit reproducible baseline migrations to development branch rather than relying on ad hoc environment setup.
2. Provision synthetic test identities and perform actual cross-account RLS tests.
3. Deploy test-only Supabase Edge Functions with test secrets, never production keys.
4. Configure independent Cloudflare Worker Preview with isolated Supabase endpoint and test Stripe mode. Current production Wrangler has workers_dev=false and preview_urls=false; never deploy development branch with production route.
5. Test application, billing, AI and mobile UX; obtain owner acceptance before any production deployment.
