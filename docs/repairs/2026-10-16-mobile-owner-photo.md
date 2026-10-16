# Mobile metrics, owner navigation, and photo feedback repair

## Scope

- Replace the effective fixed minimum width of Today metric rows with shrinkable, aligned columns. Numeric values may wrap rather than escape the card. No global overflow clipping is used.
- Start the existing owner-only navigation check independently of billing/profile loading. Keep the entry point at the top of Account & Privacy. Keep all existing server owner authorization, verified-factor checks, and MFA requirements.
- Display persistent Quick Log selection, preparation/upload, analysis, result, and error states. Validate response content before presenting a successful estimate. Require a component breakdown for photo results. Preserve existing authentication and the original logger as the only writer.
- Block duplicate form submissions and changes to submission inputs while the existing logger is active. Preserve pre-save failures for correction. A browser analysis deadline does not claim to cancel server work and never automatically retries it.
- Explain unsupported HEIC/HEIF and oversize images rather than silently proceeding. This release does not add a HEIC decoder and does not establish that HEIC caused the reported incident.
- Refresh static shell assets; never cache authenticated API responses in the service worker.

## Verification completed before commit

- Node 22 syntax checks for all changed JavaScript modules: passed.
- `node tests/entry-reliability.test.mjs`: 38 assertions passed, including invalid responses, zero-valued valid estimates, format/size messages, exact errors, timeout, and no automatic retry.
- Offline Chromium component/layout fixtures at 320, 360, 375, 390, 430, 768, and 1280 CSS pixels, each at 100% and 200% font size: 14 cases passed. Each checked 11 metric rows, viewport containment, no row overflow, noncollapsed progress tracks, and equal track edges.
- Six offline logging scenarios passed: successful result, failed upload with input preserved, malformed result, server error, timeout, and unsupported photo/empty submission. Duplicate-submission blocking and safe text rendering were checked.
- Four offline owner-navigation scenarios passed: unrelated member, owner without AAL2, owner with server denial, authorized AAL2 owner. Browser DOM tampering did not permit navigation; sign-out hid the control.
- Zero browser page errors in the component harness.

## Limits and release gate

These are local component tests with a synthetic logger and authentication responses, not live end-to-end tests. They do not prove production deployment, upstream AI recognition, provider availability, or authenticated server access controls. No real customer photos, meal records, credentials, billing actions, or deletions were used in these tests. No backend nutrition model, storage policy, billing code, or administrative authorization function was changed by this source patch.

The existing Cloudflare check for base commit `e658288875b57b50689db2855bff036a06b2e385` reported failure when checked. Treat the frontend repair as unpublished until a new successful deployment is confirmed. Run the repository regression suite/build and the applicable release checks before promotion. Verify the deployed Account & Privacy screen, a disposable authorized test photo, ordinary-member exclusion, and mobile presentation; do not use real-account destructive tests.
