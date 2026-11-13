# CHESS CORP 2 — Round 53 public booking and analytics security

**Branch:** feature/operations-overview. **Draft PR:** #24 (unmerged).
**Production:** main and Vercel unchanged; financial and regulated actions OFF.

## Engineering work

Five anonymous entrypoints now share an atomic, tenant-PostgreSQL
per-minute quota system instead of process-local counters. The shared
Round 52 approved Cloudflare/Turnstile, HMAC-key and trusted-ingress
settings are reused; missing config or database fails closed. Requests
use an ACTIVE platform tenant and canonical tenant schema. Trust only
a reverse-proxy-overwritten IP header; arbitrary X-Forwarded-For chains
must not become distinct quota subjects. Visitor data is HMAC digested.

| Public API | Per-minute tenant / resource / visitor / unknown quota |
| --- | --- |
| Booking submit | 60 / 20 / 5 / 2, with server-verified Turnstile |
| Booking cancellation | 90 / 30 / 10 / 3, plus management token |
| Booking slots | 600 / 200 / 30 / 5 |
| Forms 2.0 analytics | 1000 / 180 / 40 / 8 |
| Published-site analytics | 1000 / 180 / 40 / 8 |

429 responses carry Retry-After: 60. Booking submit and cancel bodies
are limited to 32 KiB; analytics POST bodies to 8 KiB. Hosted booking
pages show a Turnstile challenge and reset its one-time token after
failed submission. Cancellation checks the random management token and
writes booking/calendar canceled states inside one serializable
transaction. Post-commit notifications cannot run on rollback.

## Following incomplete authorization item

Untrusted public site tracking previously could dispatch a business
SITE_FORM_SUBMIT automation based only on an anonymous event string.
The route is now observational only; no anonymous event authorizes
workflow or financial consequences. Analytics requires the requested
published site and published page to match. Forms 2.0 tracking
requires a PUBLISHED form and owned step, and cannot accept
browser-declared SUBMIT_SUCCESS, PAYMENT_INIT or PAYMENT_SUCCESS.
Hosted F2 page-view analytics now go through the metered endpoint
rather than server-side unmetered inserts.

## Verification and limits

New source gate, pure policy tests, mocked endpoint trust tests,
transaction cancellation tests and independent-client disposable
PostgreSQL contention run in the normal GitHub Actions workflow.
Final CI evidence must be checked on the exact final SHA.

No new external secret or provider account was invented. The Round 52
Cloudflare secret, public site key, exact hostnames, private rate HMAC,
trusted reverse-proxy header, and CHESS_PUBLIC_FORM_ABUSE_ENABLED=true
are all owner-supplied and must be verified in protected staging. Their
absence denies public writes and even public slot queries. Passive
analytics is quota-limited, not interactive-CAPTCHA challenged, and
remains untrusted; an edge WAF and a separately approved abuse/pen test
are still required.

This round does NOT certify all other public/machine capabilities,
cross-business grants, webhook idempotency, external WORM audit custody,
legal approval or production readiness. 8/8 milestones remain BLOCKED;
0/8 signed off. Draft PR #24 is NOT merged or deployed.

## Follow-on reschedule self-service review (Round 53)

The public management page now checks ACTIVE tenant registry and exact
schema, a still-active booking page, and constant-time random manage-token
verification before revealing invitee details. The reschedule client
supplies a fresh Turnstile token to the new booking reservation. It tracks
the replacement booking ID and never submits another replacement after
a partial success, preserving a retry-only path for canceling the old
booking. Cancellation failure or an unknown network outcome cannot
report successful rescheduling or silently double-create a new booking.
Atomic multi-reservation reschedule is NOT yet implemented; true
cross-transaction guarantees and support workflows need separate design.
