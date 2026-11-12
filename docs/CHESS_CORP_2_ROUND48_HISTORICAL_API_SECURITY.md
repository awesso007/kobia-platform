# CHESS CORP 2 — Round 48 historical API security remediation

**Scope:** `feature/operations-overview`, draft PR #24. Independent KOBIA
platform; CHESS Corporation is the first multi-service tenant. No
merge, deployment, financial execution or protected vendor invocation.

## Source-of-truth inventory and classification

The Round 37 snapshot tracks 162 non-CHESS historical route files:
111 READ_PATH_REVIEW_REQUIRED, 9 PUBLIC_CAPABILITY_NEEDS_REVIEW,
26 MACHINE_CALLBACK_NEEDS_REVIEW, 13 SOURCE_GUARDED_SUBSET and
3 UNVERIFIED_SESSION_DISABLED. Round 43 added response-before-release
audit to 41 GETs and some tRPC/search sources. Round 47 signed all
17 Vercel legacy cron routes. Round 48 adds a method-level source gate
for known reviewed public/machine controls but does NOT convert the
other historical methods to transaction-coupled SELECTs or reviewed
mutation authorization.

## Concrete Round 48 changes, with failure outcomes

| Surface | Prior risk | Current branch-only code |
| --- | --- | --- |
| Forms 2.0 public payment | Unauthenticated endpoint accepted a fake pending ID and marked `PAID` when Stripe absent | Unconditionally HTTP 503 `paid:false`, no DB/settlement/analytics side effect |
| Inbound email | Shared-secret string compare; arbitrary recipient parsed with fallback to `acme`; first mailbox selected | Strong 32+-byte digest equality, strict single configured alias, exact ACTIVE registry/schema and ACTIVE mailbox before any write |
| Twilio 5 callback handlers | Vendor signature existed but `?tenant=` fell back to `acme` | Signed URL must provide exact lowercase safe tenant, ACTIVE registry/schema; outbound number, SMS, call and TwiML callbacks mint tenant-bound URLs |
| Booking cancel | Ordinary string token comparison and stale read-then-update | Constant-time 36-character hex token check and conditional UPDATE before notification |
| Public click/open tracking | Guessable recipient IDs and arbitrary external open redirect from unsigned `?url=` | HMAC-signed tenant/recipient/purpose/expiry token; no key means no pixel issuance; unsigned clicks 404; unsigned opens inert |
| Legacy Stripe billing/signup callbacks | No unique event replay receipt, metadata-based plan or tenant provisioning, out-of-order subscriptions | Both routes unconditionally fail closed with 503; certified replacement inbox, signature verification and verified settlement still must be implemented |
| Machine ingress | Clerk browser middleware blocked scheduled cron or mail callback before their own machine guards | Explicit narrow public route allowlist for cron, inbound mail and disabled payment initiation; each handler enforces its independent authorization |
| CI drift and smoke | Round 43 GET/47 cron checks left other public-machine method controls untracked | New script verifies 162-file method classification and reviewed security markers; existing production-server smoke probes default-deny without DB or real keys |

## Limits and outstanding code work

This round does **not** complete an all-sensitive-read audit. Remaining
historical authenticated POST/PUT/PATCH/DELETE responses, 9 public
capability routes' scope/abuse handling, vendor event replay control,
machine callback delivery order, query-level live tenant authorization,
cross-business permissions, immutable external archive, idempotent
provider refunds and compensation still require detailed changes,
test fixtures and independent acceptance. The two Stripe callback
handlers are safely unavailable, NOT an implemented billing event inbox.
Unwired campaign click token issuance and process-local form rate limits
are also still incomplete. No actual Twilio/relay/Stripe staging replay
or witnessed two-tenant browser test has been performed.

**Expected CI:** normal build/lint/typecheck/unit/source/security HTTP,
CHESS disposable PostgreSQL and legacy ledger PostgreSQL jobs must
pass on the exact final branch SHA. Authenticated browser and real
provider acceptance are separate protected activities.

## External owner evidence required

See canonical checklist Round 48 and groups 02/03/05/13/15/17/18 for
distinct vault-only `EMAIL_INBOUND_SECRET`, `EMAIL_INBOUND_DOMAIN`,
`KOBIA_TRACKING_SIGNING_KEY`, test-only Twilio signed callback
configuration, vendor sandbox customer/price matching, WORM/pager,
distributed abuse control, separate tested entities and review signoff.
No secrets are in the repository.

**Status:** M1/M8 PARTIAL; 8/8 production release milestones BLOCKED;
0/8 independently signed. Draft PR #24 stays unmerged.
