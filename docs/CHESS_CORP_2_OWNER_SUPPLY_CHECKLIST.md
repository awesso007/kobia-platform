# CHESS CORP 2 — single owner-supplied credentials and approvals checklist

**Canonical external-input register | Reconciled Round 55 | Final exact-SHA CI evidence required (November 12, 2026)**

**Scope:** CHESS Corporation's service-operations tenant on the **independent KOBIA platform**, on branch `feature/operations-overview` / draft PR #24. This is the **one consolidated list of things the owner, vendor, licensed supervisors or release team must supply**. It replaces scattered round-by-round "you must supply" lists as the planning checklist; those older technical documents remain supporting references, not separate shopping lists.

**Latest verified prior round (not external acceptance):** Round 53 final
commit `59acb65d621d3c97a0ea1075b6ae0ab3b1485e09` passed all three
normal CI jobs in [run 43340055042](https://github.com/awesso007/kobia-platform/actions/runs/43340055042).
Rounds 54–55 must have their own exact final SHA green 3-job CI run;
no older passing job certifies later commits. The final SHA and run are
recorded on draft PR #24 after verification.
No normal CI run supplies actual Clerk browser sign-in, security/axe
acceptance, legal, storage, provider, staging or production approval.
No normal CI run can establish a real signed-in Clerk/Neon browser/axe
acceptance, private S3 redaction/deletion, vendor settlement, WORM/PITR,
or independent legal/security approval. All feature activation and
external credentials remain under this one checklist; source-only
placeholder values are NOT owner approval.

**Legend:** `P0` = isolated fictional demo; `P1` = protected staging and compliance pilot; `P2` = production release. **Status of every item below: NOT INDEPENDENTLY VERIFIED / OWNER OR PROVIDER ACTION REQUIRED** unless an approved human reviewer records the external evidence and successful protected staging workflow. This is not a claim that you do not own an account or license. Owners may provide documentation or authorize a specialist to configure it.

## Round 55 — provider callbacks, legacy business scope and unsubscribe

**All requirements OPEN / no owner credentials supplied.** Reuse existing
owner-supply groups **01,02,03,04,05,06,13,15,17,18**. The following
configuration placeholders and evidence are mandatory before activation:

- **New marketing recipient secret:** supply
  `CHESS_UNSUBSCRIBE_ENCRYPTION_KEYS` in an approved vault as one or more
  **64-character hexadecimal AES-256 keys** separated by commas (current
  encryption key first; retained decryption keys after a reviewed rotation).
  Require HTTPS `NEXT_PUBLIC_APP_URL` for new encrypted opt-out links.
  Never put key material in GitHub, tickets, this chat or log output.
  Missing key or invalid origin intentionally blocks new broadcast email
  to avoid sending messages without a secure opt-out link.
  Existing legacy emails with only unsigned tenant+email opt-out links
  will not self-authenticate: owner must offer a verified manual unsubscribe
  support process and send replacement links where legally required.
- **Provider trust:** supply only through a secrets vault
  `CRON_SECRET`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
  `EMAIL_INBOUND_SECRET`, `EMAIL_INBOUND_DOMAIN`, the approved
  provider callback HTTPS origin, private rate HMAC and trusted edge
  ingress identity. In a real vendor sandbox, confirm all 17 crons
  require their secret, skip suspended/mismatched registry schemas,
  and all five signed Twilio callbacks refuse foreign AccountSid,
  duplicate form keys, wrong phone numbers and replayed status.
- **Historical provider replay migration:** inspect existing data for
  duplicate `SmsMessage(direction,providerMessageSid)` and
  `EmailMessage(accountId,direction,externalId)` before applying
  the Round 54 UNIQUE migrations to non-disposable environments.
  Resolve duplicates through approved retention/audit workflows, not
  automatic record erasure. Test two application instances, retry races
  and misdelivered Twilio or mail callbacks.
- **Multi-business ownership backfill:** supply reviewed business-to-number,
  mail-account and CRM Lead/Contact/Deal mappings and consent/legal-sharing
  rules, including historical INACTIVE businesses. The legacy routes now
  deliberately refuse operations when more than one business unit has
  existed and source rows have no explicit businessId. A one-business
  demo does not establish safe cross-business tenancy.
- **Mail and delivery acceptance:** operator must manually review inbound
  sender linkage before CRM client association. Provider inbound
  attachments are denied until private quarantine, malware scanning,
  exact bytes, hold/version policy and reviewer approval are in place.
  Test post-COMMIT notification/email/SMS and automation retries,
  duplicate delivery and UNKNOWN; durable outbox is still engineering
  work. Independently accept e-signature identity, intent, audit
  retention and countersigned legal records.
- **Protected acceptance:** 2 actual authenticated tenants,
  OWNER/ADMIN/MEMBER/VIEWER, revoked roles and assignments,
  historical multi-business and service-grant data, signed vendor
  sandboxes, receipt archive and external penetration/DR review.
  Source gate and disposable CI are not external acceptance.

The Round 55 technical record is
[Round 55 public/machine review](CHESS_CORP_2_ROUND55_PUBLIC_MACHINE_AUTHZ.md).
**All 8 production milestone gates BLOCKED, none independently approved.**

## Round 53 — public booking/analytics edge protection and authority

No new external credential names. Reuse Round 52 supply groups
**02, 03, 04, 06, 15, 17, 18** and its exact settings:
CHESS_PUBLIC_FORM_ABUSE_ENABLED, NEXT_PUBLIC_CHESS_TURNSTILE_SITE_KEY,
CHESS_TURNSTILE_SECRET_KEY, CHESS_TURNSTILE_ALLOWED_HOSTNAMES,
CHESS_PUBLIC_FORM_RATE_HASH_KEY, CHESS_PUBLIC_FORM_TRUSTED_IP_HEADER.

Require external owner/provider evidence for:
- Authorized Cloudflare widgets and exact hostnames for booking pages,
  embedded forms and preview domains; TEST live Siteverify rejects
  expired, reused, malformed, wrong-action and foreign-hostname tokens
  BEFORE booking/calendar/email and automation writes.
- Verified edge ingress that overwrites trusted IP header; impossible
  direct-origin bypass; two independent hosted instances; cross-tenant
  quota, suspicious unknown IP, same-NAT accessibility, 429 headers,
  DB outage, proxy compromise and public slot flood tests.
- Preview of published sites/forms and descendant pages/steps only.
  Prove anonymous site FORM_SUBMIT never starts a privileged workflow.
  Prove public F2 events cannot forge paid/complete transaction status.
  Test concurrent cancel/event status and no notifications on rollback.
- Independent WAF/bot-score deployment for passive analytics (no
  interactive CAPTCHA), consent/privacy policy and retention approval,
  protected multi-tenant/role acceptance and reviewer signature.

Feature flag OFF or missing configured provider/database intentionally
denies public writes and booking slots. This is a source-only
milestone, not a production launch. 8/8 release gates remain BLOCKED.

## Round 52 — public form anti-abuse provider and staging acceptance

Under existing owner-supply **02, 04, 15, 17 and 18**, independently
configure and review:

- **Cloudflare Turnstile:** create sandbox and approved deployment widgets,
  supply the public `NEXT_PUBLIC_CHESS_TURNSTILE_SITE_KEY`, protect
  `CHESS_TURNSTILE_SECRET_KEY` in the runtime/GitHub Environment secret
  manager, and set exact `CHESS_TURNSTILE_ALLOWED_HOSTNAMES`
  (no wildcard, scheme or port). Test valid, expired, reused, missing,
  wrong-action and wrong-hostname tokens. The secret is server-only;
  never send its value into ChatGPT or GitHub source/comments.
- **Distributed request quotas:** provision an independent 32+ byte secret
  `CHESS_PUBLIC_FORM_RATE_HASH_KEY` in the vault (rotate with a planned
  temporary quota reset), migrate/verify `ChessRequestRateWindow` on every
  intended tenant schema, and check concurrent requests on at least two
  separate hosted application instances. Review 120/min/tenant,
  40/min/form, 8/min/trusted-IP, 3/min/unknown settings and legitimate
  shared-NAT accessibility impacts.
- **Trusted ingress:** explicitly set `CHESS_PUBLIC_FORM_TRUSTED_IP_HEADER`
  to `x-vercel-forwarded-for` or `cf-connecting-ip` ONLY after showing
  that the approved reverse proxy overwrites the header and direct-origin
  bypass is impossible. Do not configure end-user `x-forwarded-for`.
  Test spoofed comma chains, missing IP headers, bursts, outages, and 429
  Retry-After. No raw IP identity is retained in the quota table.
- **Protected activation:** set `CHESS_PUBLIC_FORM_ABUSE_ENABLED=true`
  only in protected fictional staging after confirming forms render
  and reset Turnstile challenges. Default absence/false, quota database
  outage, or Siteverify failure denies new leads and submissions.
  Confirm CORS/embed hostnames, privacy policy/retention, and no automation
  side effects after challenge denial. Evidence: approved test origins,
  actual hosted response captures, reviewer and dated acceptance.

**No provider account or secret was supplied during Round 52.**
Bookable appointments, public analytics trackers, unsubscribe and remaining
public/machine routes still need independent abuse/authorization review.
All 8 production milestones remain blocked, none signed off.

## Round 51 — public booking protected staging acceptance

No new production secret is required for the code-only booking transaction.
Existing owner checklist items **02, 04, 06, 17 and 18** remain open: provision
two fictional ACTIVE/SUSPENDED tenants, test distinct staff calendars,
parallel same-slot booking, invalid dates, cancellation and email automation
failure, including revoked tenant status. Independently review distributed
abuse/rate limits, public consent and retention, timezone/DST and verified
post-commit notification delivery. A disposable CI PostgreSQL contention
check is not real hosted or load-tested acceptance. Do not turn on live
external notifications or permit client data without approval.

## Round 50 — transaction-coupled sensitive reads: external acceptance

**No new secret is necessary for the code-only audited SELECT changes.**
The following evidence remains **NOT supplied** under existing
owner-supply groups **01, 02, 03, 15, 17, and 18**:

- **Two independent tenants and identities (01/02/03/17):**
  protected Clerk TEST credentials and separate migrated tenant
  schemas with OWNER/ADMIN/MEMBER/VIEWER, a suspended user,
  revoked client-service grants and concurrently changing
  business-unit assignments. Run signed-in HTTP read/response
  tests against real isolated fixtures. Confirm a 403/404/503
  never leaks data to any wrong-tenant, wrong-business or revoked
  principal and retry behavior does not bypass transaction checks.
- **Legacy accounting tenant membership (01/02/17):** separate
  legacy-ledger Prisma TEST schema/DB matching the authenticated
  tRPC tenant and membership registry; re-run protected tRPC
  queries for revoked users, suspended tenants, read failures,
  long-running queries, serialization conflicts and audit insert
  outage. Test independent customer/owner privacy boundaries.
- **Immutable audit custody (15/17/18):** configure approved
  external WORM/archive retention and a reviewer with no access
  to production credentials. Confirm `ChessSecurityEvent` and
  legacy `AuditLog` receipts are externally preserved and
  selectively accessible for compliance. CI DB-local receipt
  tests are not external immutable evidence.
- **Regulated scope/review (03/15/17/18):** independent counsel/
  license-holder decisions for which mortgage, insurance, tax,
  employee, payroll and investment data may be read under which
  client grant. Perform a witnessed tenant, business and client
  role-revocation race test plus a separate penetration review.
- **Availability (02/17):** verify serializable transaction
  timeouts and PostgreSQL connection-pool capacity under
  production-like load before approving release. A timeout must
  deny a read, not silently bypass the audit. Keep all regulated
  actions default-OFF.

Current placeholders (no additional keys):
`DATABASE_URL`, `DIRECT_URL`,
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`,
`CLERK_SECRET_KEY`, `CHESS_PUBLIC_ORIGIN`,
and the existing audit archive vault/provider configuration.
Do not record values in source or this list. The isolated CI
PostgreSQL fixture requires **none** of the owner's production
secrets. No workflow is merged or deployed.
**8/8 production milestones remain BLOCKED, 0/8 approved.**

## Round 49 historical authenticated mutations — protected owner acceptance

**Open and not independently attested** under existing groups
**01, 02, 03, 05, 15, 17 and 18**. No additional secret is
needed for the static code fixes.

Supply a protected **Clerk TEST + isolated Neon staging** setup
with TWO actual active tenants, distinct OWNER/ADMIN/MEMBER/VIEWER
and revoked identities, valid and revoked client-service grants,
two site/page/block trees, two form/field/step trees, separate
private/DM channel memberships, legitimate member DM targets,
and uploader/uploader-revoked sessions. Demonstrate that
foreign tenant, suspended tenant, guessed private channel ID,
foreign form/site/workflow child URL, duplicate reorder IDs,
cross-account local upload, over-limit file and foreign
message parent each deny without data exposure or side effects;
then demonstrate allowed routes still function.

Verify same-origin browser POST/PATCH/PUT/DELETE against
`CHESS_PUBLIC_ORIGIN` in protected staging and review existing
process-local file/webform CSRF and distributed abuse controls.
The legacy `/tmp` LOCAL upload path is **development-only**;
do not enable in production. Validate S3 Object Lock, scanner,
version, tenant grants, separate licensed service boundaries
and audit immutability before approving production file handling.

The Round 49 source gate and mocked unit checks are **not**
a substitute for protected signed-in browser testing,
same-transaction consent/authorization plus mutation audits,
or a third-party penetration test. New variable values are not
introduced; existing `CHESS_PUBLIC_ORIGIN`, Clerk, Neon, S3,
WORM and reviewer inputs remain in this owner checklist.
All 8 production milestones remain BLOCKED; none is approved.

## Round 48 — historical public/machine route owner supply and protected acceptance

**Open requirements; none evidenced by normal CI.** These belong in
existing groups **02,03,05,13,15,17,18**, not new numbered groups.

- **Machine mail (02/15/17):** supply unique 32+-byte
  `EMAIL_INBOUND_SECRET` to the approved relay and server vault (never
  client or source). Set `EMAIL_INBOUND_DOMAIN` to the approved exact
  inbound recipient host (default `inbound.kobia.ai`). Configure ACTIVE
  per-tenant aliases `kobia+<slug>@domain` on their own ACTIVE EmailAccount
  rows, and prove invalid/foreign/suspended aliases fail before writes.
  Relay TLS, body limits, duplicate Message-ID handling and attachment
  malware/delivery controls need independent staging review.
- **Tracking (03/15/17):** create a unique high-entropy 32+-byte
  `KOBIA_TRACKING_SIGNING_KEY` in a protected server vault. Tokens
  are purpose, recipient, tenant and expiry bound; a missing secret
  disables tracked clicks/pixel issuance. Move legacy unsigned campaign
  click URLs to server-minted tokens and validate expired/replayed links
  in staging. Do not expose signing keys in client HTML.
- **Twilio (02/15/17):** supply certified `TWILIO_AUTH_TOKEN` and
  provider configuration. Reconfigure all number/SMS/voice/recording
  callbacks to include an explicit tenant query signed as part of the
  provider callback; no default-tenant links are accepted. Prove the
  tenant registry ACTIVE check, number ownership and provider replay
  idempotency under separate test tenants. No protected provider run
  occurred.
- **Billing (13/17/18):** both historical Stripe webhook handlers remain
  deliberately non-operational regardless of existing Stripe keys.
  Supply trusted sandbox credentials, authoritative customer/plan/price
  mapping and legal merchant approvals only to a replacement signed,
  idempotent, transactional event-inbox implementation. Test duplicate,
  out-of-order, payment-failed, refund, trial and cancellation outcomes
  before independently reviewing activation. No payment is collected by
  the public Forms 2.0 payment endpoint.
- **Security/abuse (03/15/17/18):** independent authenticated two-tenant
  and adversarial public-form submissions, distributed rate-limit
  storage, record-specific mutation authorization/atomic response audit,
  audit WORM receipts, webhook retries, replay windows and real
  source-data deletion tests remain open. Current form rate limits
  are memory-local, not a distributed admission-control guarantee.

All new named configuration variables are represented as commented
placeholders in `docs/CHESS_CORP_2_ENV_PLACEHOLDERS.example`; do not
paste live secrets into this checklist or Git. All eight release gates
remain BLOCKED, zero independently approved.

## Round 47 — protected scheduler secret and acceptance (M4/M8)

**Status: OPEN, not independently verified.** Existing owner-supply groups
**02 (protected environment), 15 (operations monitoring), 17 (staging tests)
and 18 (independent release review)** now explicitly include the legacy
KOBIA Vercel scheduler. Supply and keep in the protected target environment
a **unique, 32+-byte, high-entropy server-only `CRON_SECRET`**. Configure
it in the Vercel project's protected environment variables for the
appropriate *reviewed staging* deployment. Vercel Cron sends
`Authorization: Bearer <CRON_SECRET>` with scheduler invocations; never
copy the value into Git, chat, a URL, client JavaScript or an example file.
Rotate with the deployment/operator runbook. Do not reuse Clerk, bank,
worker, scan or webhook credentials.

Acceptance evidence required: an unauthorized HTTPS call to each scheduled
route yields 401 (503 with missing/weak secret); no tenant work occurs
without bearer auth; all 17 authorized staging cron invocations work under
the configured Vercel scheduler and respect tenant/worker scope; failures,
rate/abuse patterns, duplicate delivery, idempotency and retry handling are
reviewed. Normal CI tests only the source and local auth contract; it
**does not** have this secret or attest live scheduling. Leaving
`CRON_SECRET` unset deliberately disables all 17 legacy cron routes.
The rest of the 26 inventoried machine/callback surfaces and 9 public
capabilities still need separate security review. No new numbered owner
group is added, and no release gate is cleared.

## Round 46 protected fictional demo employee/client E2E — remaining owner supply

Round 46 added **six actual browser test cases** for OWNER, SUPPORT
employee and CLIENT in a separate file registered with Playwright's
protected `chromium` project. The cases exercise an eight-business
owner tour, employee two-tab optimistic conflict, foreign-business
write denial, client identity/consent/privacy isolation, opt-in/out
work-item and appointment calendar preference, and mobile employee/client
axe WCAG checks. The prior Round 40 specs remain in place.

Normal CI now syntax-checks the browser spec and runs source-policy
guards; it also executes **real disposable PostgreSQL tests** proving
five fictional profiles each retain two independent business links,
no service grants, no private documents/cases, and exactly one PENDING
consent with unsigned acceptance denied. **No real Clerk TEST
sign-in or browser/axe execution has been performed by normal CI**.

- **Existing group 17:** An authorized owner must provision/approve the
  protected GitHub Environment named `chess-demo-e2e` with
  `secrets.DATABASE_URL` targeting **only** the non-pooled, TLS,
  completely isolated fictional Neon `chess_demo` database;
  `secrets.CLERK_PUBLISHABLE_KEY` beginning `pk_test_` and
  `secrets.CLERK_SECRET_KEY` beginning `sk_test_`, both from the
  **same** development/test Clerk instance; and three
  **distinct, verified test-user** variables
  `vars.CHESS_DEMO_OWNER_EMAIL`,
  `vars.CHESS_DEMO_EMPLOYEE_EMAIL`,
  `vars.CHESS_DEMO_CLIENT_EMAIL`. Do not reuse a production
  account, real client profile, payroll credential or linked data.
- **Existing groups 01,02,17:** After protected environment approval,
  deliberately invoke the manual workflow
  `.github/workflows/chess-demo-browser-e2e.yml` on
  `feature/operations-overview` with the mandatory
  `confirm_isolated_demo=true` assertion. Its browser is pinned
  to `http://127.0.0.1:3000`, its provider flags are OFF, and it
  refuses remote/prod or pooled targets. Confirm owner/employee/client
  can sign in independently, restore the calendar preference OFF and
  keep all fictional consent PENDING.
- **Existing groups 17,18:** Independently review and retain the
  actual Playwright results, failure traces and screenshots, including
  mobile keyboard/screen-reader/axe acceptance, cross-business data
  access and a separate signed-off role/consent downgrade matrix.
  The ordinary `build` job **cannot certify** those results.
  Complete client privacy and accessibility approvals before P1/P2.

**No new external service, 19th supply group, API key or provider
execution flag is introduced.** This is still a **pending protected
workflow requiring human-provisioned Clerk TEST/Neon credentials**,
even when normal GitHub Actions CI is green. No real customer consent,
financial transaction, licensed service or external calendar event
is authorized by these fictional tests.
See [Round 46 test matrix](CHESS_CORP_2_ROUND46_EMPLOYEE_CLIENT_BROWSER_E2E.md).
All 18 existing owner-supply groups remain OPEN, with
**8/8 production milestones blocked and 0/8 independently signed**.

## Round 45 M3 document lifecycle — legal, storage, scanning and audit evidence

The code now inherits **immutable retention, legal hold and download
suppression** across replacement/redacted version chains in the
PostgreSQL migration. Upload confirmation requires a strict S3 HEAD
and an exhaustive single-version inventory, then records an
audited live-grant/consent-bound outcome; malware scanning remains
quarantined and single-use. Separate owner/admin review of a clean-scanned
REDACTED derivative now verifies full pinned bytes and SHA-256 and
requires a post-scan review-read event plus reviewer attestation before
publication. The employee interface exposes the preexisting third-person
UNKNOWN S3 **read-only** reconciliation; physical deletion is still
default OFF and can NEVER be retried automatically after an UNKNOWN
provider result.

| Open groups | Independent owner/provider evidence still required |
| --- | --- |
| **01, 02, 03** | Genuine active/revoked OWNER/ADMIN, uploader and independent redaction/disposal reviewer identities, per-business/current-client purpose consent and role transitions, legal sharing authorization; prove actor separation and revocation mid-operation |
| **04** | Counsel-approved signed service/jurisdiction retention schedules, legal-hold issue and release/appeal procedure, subject access/erasure request workflow, e-sign disclosures; confirm neither a replacement nor a redaction shortens an original retention duty |
| **05, 16** | A private, versioned and Object-Locked S3 provider with isolated runtime/worker/migration IAM, vault-only `KOBIA_S3_*` and `CHESS_DOCUMENT_PURGE_WORKER_TOKEN`, full `HeadObject`, `GetObject`, `s3:ListBucketVersions` and exact `DeleteObjectVersion` rights at approved scope; Object Lock/WORM, legal hold, backup/replica purge accounting, independent KMS/PITR and witnessed restore |
| **15** | External immutable/WORM archive receipts and monitoring of DENY/REVIEW/ALLOW scan, upload, download, supersession, hold, disposal and UNKNOWN events; local append-only DB events do NOT meet the external audit retention requirement |
| **17** | Protected isolated tenant/Clerk TEST and S3 sandbox, realistic double-PUT/multiple-version race, scan timeout/invalid HMAC, malware corpus, inaccessible storage and revoked grant tests, forced UNKNOWN/reconnection plus no second DELETE, proof that the S3 upload grant cannot overwrite accepted evidence unnoticed |
| **18** | Independent cybersecurity, privacy and records reviewers attest to actual complete PDF-layer/image redaction (not only visual overlays), legal hold and backup retention, third-person disposal witness, inspector identity, accessibility, negative tests and final authorized rollout |

**No new API key, external contract, flag, credential or checklist
group is introduced by this round.** Existing provider credentials
and reviewer identities are still REQUIRED to perform P1/P2,
not for running source-only tests. The already-listed
`s3:ListBucketVersions` permission is now also required during
**upload confirmation, malware scan and independent redaction review**,
not only before deletion; grant it only on the approved private tenant
bucket with least-privilege policies and separate storage roles.

`CHESS_DOCUMENT_LIFECYCLE_ENABLED=false`,
`CHESS_DOCUMENT_RETENTION_POLICY_APPROVED=false`,
`CHESS_DOCUMENT_PURGE_EXECUTION_ENABLED=false`,
`CHESS_DOCUMENT_PURGE_STORAGE_APPROVED=false` and
`CHESS_SCAN_CALLBACK_ENABLED=false` must remain OFF until
independent approvals are collected. See
[Round 45 exact code and acceptance report](CHESS_CORP_2_ROUND45_DOCUMENT_LIFECYCLE_AUDIT.md).
All **18** owner groups remain OPEN; all **8** production milestones
remain blocked with **0 independently signed**. No real customer
documents were deleted or restored in this coding round.

## Round 44 dual-database financial failure testing — remaining owner evidence

Eight additional synthetic-but-real-database integration tests now cover
lost reservation acknowledgments, simultaneous duplicate posting,
conflicting source fingerprints, failed GL-offset validation after an
UNMATCHED bank claim, account deactivation after claim, timeout during
read-only outcome observation, simultaneous receipt writes and
alternate-source replay. The existing six Round 38 scenarios remain
in the CI suite, for **14 total isolated cases**. These use two
**disposable database names on one GitHub PostgreSQL service**, not
separate live finance clusters or payment providers.

| Existing owner-supply groups | Required independent acceptance before financial posting is enabled |
| --- | --- |
| **07** | Verified sandbox bank/aggregator/transaction source, certified bank-to-GL idempotency and source binding, **real** rejected-replay and timeout/late-ACK evidence; no customer credentials in code |
| **14** | Accounting owner approves the UNKNOWN, UNPOSTED and DIVERGED human-only decision tree, four distinct user roles for late receipt reconciliation, bank/ledger balance evidence and statutory period controls |
| **16** | Witnessed two-system recovery (PITR/restore) after intentionally terminated cross-database transaction, side-effect inventory and evidence for both independent systems |
| **17** | Protected **two separately operated databases/services**, realistic network-cut and reconnect tests (before/after COMMIT, partial write, double dispatch), staged client consent revocation, disabled retries, monitoring/pager |
| **18** | Independent security and accountant signoff of exactly once GL/journal behavior, source-digest and audit access, race conditions, restore evidence and no premature customer consent unlock |

**Existing feature gates remain OFF:** live posting and fourth-person
outcome resolution are not activated by the tests or their success.
The new CI cases do not issue an external financial API call, settle
a bank deposit or authorize wages, taxes or ledger close.
`RUN_CHESS_DISTRIBUTED_DB_INTEGRATION=1` and
`CHESS_FAULT_LEGACY_DATABASE_URL` remain **CI-only disposable database
settings**, NOT an owner-supplied production credential.
**No new external credentials, API keys, contracts, approvals, environment
placeholders, or checklist item 19 are required** for this test-only
round. Existing 18 groups remain OPEN until signed by independently
authorized reviewers. See [Round 44 fault matrix](CHESS_CORP_2_ROUND44_FINANCIAL_FAULT_MATRIX.md).

## Round 43 historical sensitive reads — owner/staging acceptance, no new secrets

Round 43 source introduces a default-on fail-closed audit-before-release
wrapper for **41 authenticated historical GET route files** plus
authenticated protected tRPC successful queries and read-only search POST.
The source route inventory is **162 files**, but method-specific sensitive
read protection is not certified across all of them. The source audit
wrapper rechecks live membership before returning bytes; the underlying
legacy query is still outside the event's SERIALIZABLE transaction. A
normal green build does not verify actual cross-tenant access boundaries,
legal sharing policies, vendor immutable audit archives or all-method
read completeness.

- **Existing 01,02,03,17,18:** Provide protected separate
  non-production tenant schema/database and two genuine Clerk TEST
  identities with active/revoked memberships in different tenant/business
  scopes. Witness successful/denied GET, protected tRPC queries, private
  search POST, owner-to-MEMBER/VIEWER and SUSPENDED transitions, and
  cross-tenant token misuse. Run adversarial tests during an intentional
  audit insert outage: **no private response body may be returned**.
  Public marketing/branding endpoints should remain limited to public data.
- **Existing 04,05,15,16,17,18:** Provide approved data-sharing/purpose
  policy, immutable external/WORM event receipts, vault-separated runtime
  and migrator roles, monitoring for rising 403/503 audit-denial rates,
  and witnessed role/consent revocation plus independent privacy/security
  evidence. Legacy `AuditLog` and tenant security-event tables are
  **not** external WORM receipts.
- **Existing 15,17,18:** Explicitly audit all non-GET sensitive response
  shapes and 9 public capability + 26 machine callback routes.
  Check file-share and e-sign tokens, tenant binding, rate limits,
  time-bound permissions, webhook signatures and replay guards.
  Review the direct query path per route for row-grant/consent scope
  before certifying all-path coverage; the new GET response wrapper
  alone is not sufficient.

**No new vendor API credential, contract, approval or 19th checklist
group is created in this round.** Protected test accounts and
independent immutable audit credentials were already requested in
the existing owner-supply register. All 18 groups remain OPEN, and
production release remains 8/8 blocked with 0/8 signed.
[Round 43 route-level report](CHESS_CORP_2_ROUND43_HISTORICAL_SENSITIVE_READ_AUDIT.md)
documents the precise scope, limitations and remaining source-only
implementation work. Never enable real client records or claim
all-route security completion from normal CI.

## Round 42 verification-to-owner handoff (no new credentials or approvals created)

This round reconciles **already committed and verified Round 41 source**,
not an assertion that the external requirements have been completed.
Verified exact source `b6054ee3915f735f3b40140cf2a1e6bfac00b88d`
passed 3/3 normal GitHub Actions CI jobs in
[run 43291060523](https://github.com/awesso007/kobia-platform/actions/runs/43291060523).
No genuine Clerk/Neon browser login, provider settlement, private S3
erasure or independent external approval is proven by that run.

| Verified code/source change | What a named owner / independent reviewer must still supply and witness | Existing checklist groups |
| --- | --- | --- |
| M1/M4 employee task list and mutation roles checked atomically with audit | Two protected Clerk TEST employee/manager/owner identities, actual role downgrade and revoked-assignment races, cross-tenant private task denial, audit-outage denial and keyboard/screen-reader evidence | **01,02,03,17,18** |
| M3 document lifecycle, third-person read-only UNKNOWN resolution and pinned-version inventory | Approved per-service retention/hold/erasure/legal review; private bucket permission for `s3:ListBucketVersions`, `HeadObject`, `DeleteObjectVersion`; immutable WORM record, scanner, duplicate-version, hold race, recovery/PITR and replica/backup accounting; distinct requester/approver/resolver | **04,05,15,16,17,18** |
| M5 four-person, evidence-only reconciliation of UNKNOWN/stale EXECUTING and denial of receipt-less replay | Four independently verified finance approvers, protected separate banks/GL staging, witnessed lost-ACK/UNPOSTED/DIVERGED and consent withdrawal, accountant signoff; retain default-OFF `CHESS_BANK_OUTCOME_RESOLUTION_ENABLED` and `CHESS_BANK_OUTCOME_POLICY_APPROVED` | **07,14,16,17,18** |
| M6/M7 regulated workflows, AI and draft-only billing remain non-executing | Certified licensed partners, data-sharing contract/DPAs, merchant/payout/chargeback and statutory close evidence, accountant or licensed review | **03,04,10,11,12,13,14,15,17,18** |
| M8 source CI green but real production readiness absent | Protected signed-in browser/a11y, two-tenant penetration and load tests, worker/pager, vault, external immutable/WORM archive and witnessed PITR/DR, independently signed go/no-go | **01,02,05,15,16,17,18** |

**Checklist state: all existing 18 numbered owner-supply groups remain
OPEN / NOT INDEPENDENTLY VERIFIED**; none is silently checked off by
source CI. **Release state: 8/8 milestones blocked, 0/8 signed.**
Remaining code-only audits and incident/exception workflows also remain
unfinished, notably historical sensitive-read route review; the Round 42
documentation commit does not close them. **No new credential, contract,
approval, feature flag, or extra numbered group is required for the
documentation-only Round 42 changes.** The previously registered
`CHESS_DOCUMENT_PURGE_WORKER_TOKEN` and independently controlled bank
outcome flags remain required only when protected testing is approved;
do not enable them now.

## Round 41 exception resolution and storage version inventory — owner-supply updates

**M3, existing 04/05/15/16/17/18:** The guarded default-OFF S3
disposal worker and third-person UNKNOWN reconciliation now require
`s3:ListBucketVersions` for the **single approved private tenant bucket**
(and the previously recorded `HeadObject`/`DeleteObjectVersion` rights).
The approved operator must test duplicate presigned PUT versions,
untruncated listings, exact version 404 and **zero remaining byte-bearing
versions** before any deletion receipt is trusted. A missing list permission
or provider error must block, never certify deletion. Separately supply
independent Object Lock/legal hold enforcement, immutable/WORM audit proof,
backup+replica retention/erasure, and witnessed recovery: deleting a
single S3 version is **not** proof all personal data was erased. Ensure
**three distinct active owner/admin identities** (requester, approver,
resolver) and signed legal policy before any physical S3 deletion.
`CHESS_DOCUMENT_PURGE_EXECUTION_ENABLED=false` and
`CHESS_DOCUMENT_PURGE_STORAGE_APPROVED=false` remain OFF. The vault-only
`CHESS_DOCUMENT_PURGE_WORKER_TOKEN` stays within existing group **05**.

**M5, existing 07/14/16/17/18:** New distinct default-OFF
`CHESS_BANK_OUTCOME_RESOLUTION_ENABLED=false` and
`CHESS_BANK_OUTCOME_POLICY_APPROVED=false` flags govern a receipt-only,
**four-person** reconciliation (suggester, approver, executor and
independent resolver). Independently approve operator roles, same-business
service grants, actual protected separate bank+GL reconciliation evidence,
and an accountant-approved procedure for `UNPOSTED`, `DIVERGED`
and ambiguous `EXECUTING` outcomes. A matched GL entry never certifies
bank settlement, and an unresolved attempt must not be automatically
retried or marked failed merely because an observation says UNPOSTED.
No new vendor credentials are demanded by the source-only tests; real
sandbox sources and legally responsible reviewers are still required
before P1/P2. See [Round 41 gap audit](CHESS_CORP_2_ROUND41_CODE_GAP_AUDIT.md).

## Round 40 employee/client fictional demo E2E — protected acceptance

The existing `chess-demo-e2e` GitHub Environment (owner-supply **17**) must
provide a **dedicated, non-production Neon `chess_demo` database**, a single
Clerk **TEST** instance, and **three distinct, real verified test identities**
configured in `CHESS_DEMO_OWNER_EMAIL`, `CHESS_DEMO_EMPLOYEE_EMAIL` and
`CHESS_DEMO_CLIENT_EMAIL`. No unverified email impersonation, production
secrets or real client records are permitted. The code-only Round 40 additions
check employee business deep-link denial, stale task conflict (HTTP 409),
SUPPORT versus manager rights, client work/document API denial, and
simultaneous owner/employee/client session isolation. The protected Playwright
workflow is manual and approval-gated; **source syntax/CI checks are not
equivalent to running that authenticated browser workflow**. Capture
Playwright screenshots, accessibility violations, session role/consent
revocation and cleanup evidence for **17/18** before release.

## Round 39 document versioning, redaction and physical disposal — remaining owner supply

The branch now has source for immutable replacement versions, independently
reviewed scanned redacted derivatives, permanent suppression/legal hold,
two-person disposal request/approval, and a default-OFF worker that deletes
only a specific versioned S3 object and verifies absence. **This is
not permission to delete actual client records.** Under the existing
**04/05/15/16/17/18** groups, supply approved counsel/records retention
policy per service/jurisdiction, subject-access and legal-hold procedures,
licensed-practice review, independently supervised redaction QA and
object-storage deletion/recovery tests, immutable external audit receipts,
PITR restoration evidence and a witnessed final human go/no-go. Add the
vault-only, distinct, 32+ byte `CHESS_DOCUMENT_PURGE_WORKER_TOKEN` under
**05** and leave `CHESS_DOCUMENT_PURGE_EXECUTION_ENABLED=false` and
`CHESS_DOCUMENT_PURGE_STORAGE_APPROVED=false` until that evidence
is signed off; lifecycle and retention policy flags remain OFF too.
An UNKNOWN storage deletion requires explicit independent reconciliation,
never automatic retry. Test-only fixtures must never be treated as
legal retention approval.

## Round 38 cross-database financial outcome acceptance (no new vendor credential)

The new isolated-CI finance fault suite uses two **disposable PostgreSQL
database names** on one GitHub test service. The `CHESS_FAULT_LEGACY_DATABASE_URL`
variable is provided **only by CI** for fictional records. It is NOT a new
production credential or owner obligation. See
[Round 38 fault matrix](CHESS_CORP_2_ROUND38_FINANCIAL_FAULT_AUDIT.md).

Existing owner-supply groups **07,14,16,17,18** remain OPEN: arrange two
independently operated protected staging database services, approved
3-distinct-person operator/reviewer identities, real consent-withdrawal
and audit-outage races, observed network loss **before and after** legacy
COMMIT, provider retry/idempotency evidence, independent UNKNOWN resolution,
reconciled bank and GL receipts, disaster-recovery PITR rehearsal and signed
finance/security authorization. In particular, a clean `UNPOSTED`
reconciliation after a tenant `UNKNOWN` state must not trigger an
automatic ledger retry. A green simulated test is no substitute for a
witnessed settlement and recovery drill. All four CHESS bank-posting
activation flags remain false and no live bank or payroll service is enabled.

## Round 37 historical KOBIA sensitive-read hardening — owner evidence

**Source-only controls are not external acceptance.** Verified-client
identity and immutable access evidence still require independent staging
under existing groups **01,02,03,04,05,15,17,18**. New required
development/staging-only secret **within existing group 05**:
`KOBIA_LOCAL_DOWNLOAD_SIGNING_KEY`, distinct random 32+ byte server-only
secret kept in the approved vault. Its absence prevents LOCAL fallback
downloads. Real clients require private versioned object storage, independent
malware scans and signed audit retention; do not treat LOCAL as production.

The original support/helpdesk portal used an **email-only impersonable
session**. It is now disabled in source, including previously issued legacy
cookies and direct API reads, until a third-party-approved verified
email challenge/identity provider, single-use token consumption,
audit events and real session isolation are implemented and accepted
under **04/17/18**. **No environment toggle can reenable the old email-only
login.** Do not provide customer data or use the disabled portal as
an identity proof.

The Round 37 snapshot also adds owner/role scoped read audits for legacy
GL, trial-balance, mail, selected workflow/form submission and document
download paths. Protected Clerk roles, role revocation races, cross-tenant
identities, successful and denied access audit receipts, real storage and
WORM/PITR witnesses must still be supplied to close **02/05/15/17/18**.
Remaining historical routes must be independently inventoried and
reviewed before claiming all-path coverage.

## Round 36 legacy KOBIA tax-export privacy evidence (no new secret)

The 1099-NEC/MISC CSV exports now require current owner/admin/accountant
role, active tenant/entity, a SERIALIZABLE read-and-legacy-audit transaction,
and no-store responses. Existing **02,03,04,15,17,18** require a
protected staging test of role revocation, foreign-tenant entities,
WORM/immutable external archive delivery and independent privacy review;
normal CI cannot demonstrate these. The legacy database AuditLog is NOT
WORM evidence, and this work does not cover other historical ledger exports.
See [Round 36 audit](CHESS_CORP_2_ROUND36_LEGACY_TAX_EXPORT_AUDIT.md).
There are **no newly required credentials, feature flags, contracts or
owner-supply groups**; the numbered 01–18 checklist stays OPEN.

## Round 35 implementation-to-owner acceptance delta (no new secret)

**Source work already implemented, subject to exact-final-head CI:**
- **01, 02, 03, 17, 18 (M1/M2):** role/audit-coupled business unit,
  employee and client creation; staff assignment and service-grant
  provisioning/revocation. In protected Clerk/Neon staging, run
  concurrent owner-to-MEMBER and STAFF-to-VIEWER/suspended transitions,
  revoked unit access, failed audit writes, contact/profile ownership
  tests, and independent reviewer checks before accepting these paths.
- **01, 04, 17, 18 (M1/M3):** client service-link grant and creator
  authorization must remain separate from usable client consent.
  Demonstrate foreign-owned profiles, withdrawn client consent and
  revoked employee grants never reveal service records.
- **10, 11, 17, 18 (M6):** the regulated case index now checks current
  role/business/client-profile ownership, explicit service grant,
  purpose-specific consent and audit inside one transaction. Use
  fictional mortgage, insurance, real-estate and investment cases to
  verify no unrelated client identifiers or case payloads escape.
  Real partner/license contracts and certified execution remain blocked.
- **12, 15, 17, 18 (M7/M8):** AI triage directory, daily quota, worker
  state and action-approval inbox reads are audit-coupled and role
  scoped. Independently verify staff/manager/owner role downgrades,
  private actor-ID redaction, a failed event insert and worker health
  during a protected staged session.
- **17, 18 (M7/M8):** navigation and reports must refuse an explicit
  revoked business without auto-switching and must not carry form
  state across unit/month switches; verify with keyboard and screen
  reader on authorized test identities.

**No new `CHESS_*` variable, credential, contract or integration
was introduced by Round 35.** The 18 numbered groups below remain
the only external-input register, and all 18 remain unchecked until
accepted with independent sandbox/privacy/license/recovery evidence.
Source CI cannot authorize production data sharing or regulated work.

## Round 34 change-to-evidence reconciliation (no additional checklist items)

This crosswalk updates what the owner must **verify**, not what the owner
must **build again**. Every numbered group 01–18 below remains OPEN until
a protected test run and independent approver record actual evidence.
A completed source CI check never changes a checkbox.

| Already implemented and CI-verified source (Rounds 31–33) | What the owner/reviewer must still supply or demonstrate | Existing open groups |
| --- | --- | --- |
| **M1/M2/M8:** current business manager vs SUPPORT links, business-scoped finance choices, revoked deep-link fail-closed state and form reset | Isolated Clerk employee who is SUPPORT in one fictional unit and MANAGER in another; revoke/restore manager assignment and confirm **both UI and API** denial; independent 2-tenant/no-grant proof | **01,02,03,17,18** |
| **M1/M3/M8:** verified client-owned consent index/details with serializable ALLOW/DENY audit; no policy text loaded by directory | Clerk verified and foreign identities, CRM email change, pending/granted/expired/withdrawn consent fixtures, blocked access/audit-failure evidence, counsel-approved disclosure and private immutable audit receipt | **01,04,05,15,17,18** |
| **M4:** recurrence last-inspected indicator; named assignee, no-task empty state; failed consent lookup no longer falsely displays calendar OFF | Deployed monitored worker and backlog/pager evidence, approved delegated Google/Microsoft calendar sandbox, failed consent-status injection, keyboard/mobile/screen-reader observations | **01,06,15,17,18** |
| **M5:** manager-only read-only six-state bank attempt monitor, immutable financial attempt log and scoped finance links | Independent finance reviewer + three distinct operator roles; verified legacy source journal and **EXECUTING/UNKNOWN** outcome reconciliation/fault injection, consent lock and rollback/DR evidence; approvals before real bank posting | **07,14,16,17,18** |
| **M6/M7:** explicit invalid/revoked business links cannot select a different licensed/billing business; scoped forms reset on switch | Real contractual licensing/partner/consent/merchant approvals; protected multi-business replay/authorization scenarios and independent review; no regulated execution or cash collection implied | **03,04,10–14,17,18** |
| **M8:** owner-only audited worker/calendar/archive health snapshot; negative unit/source UI tests and green normal CI | Private HTTPS staging, independent penetration/accessibility, immutable WORM receipts, restored PITR and witnessed RPO/RTO, incident paging and final human go/no-go | **02,05,15,16,17,18** |

**Verification boundary:** A normal CI success does **not** prove actual
Clerk browser sessions, signed e-consent, provider receipts, accessibility,
independent approvals, financial settlement or production readiness.
Protected test evidence must be linked and accepted by a qualified owner;
real secret values must stay only in the approved vault or protected GitHub
environment. **8/8 milestones remain production-blocked, 0/8 independently
signed.** Draft PR #24 stays unmerged and production remains unchanged.

## Owner action checklist — one occurrence per dependency

- [ ] **01 · P0 · Optional fictional demo and signed-in browser suite (M1–M8 preview).** Provide an **isolated** Neon PostgreSQL database named exactly \`chess_demo\` (non-pooled TLS URL), a **Clerk development** instance with \`pk_test_\` and \`sk_test_\` credentials, and three distinct test users with verified primary emails: owner, employee and client. The employee/client test users must not require MFA or additional session tasks for the Playwright sign-in-token helper. Use untracked \`.env.local\` only: \`DATABASE_URL\`, \`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY\`, \`CLERK_PUBLISHABLE_KEY\`, \`CLERK_SECRET_KEY\`, \`CHESS_DEMO_OWNER_EMAIL\`, \`CHESS_DEMO_EMPLOYEE_EMAIL\`, \`CHESS_DEMO_CLIENT_EMAIL\`; set \`CHESS_DEMO_MODE=true\`, \`NEXT_PUBLIC_DEFAULT_TENANT=chess-demo\`, \`NODE_ENV=development\`. For the manual GitHub browser workflow, create a protected \`chess-demo-e2e\` environment with secrets \`DATABASE_URL\`, \`CLERK_PUBLISHABLE_KEY\`, \`CLERK_SECRET_KEY\` and variables \`CHESS_DEMO_OWNER_EMAIL\`, \`CHESS_DEMO_EMPLOYEE_EMAIL\`, \`CHESS_DEMO_CLIENT_EMAIL\`. The client email maps only to the first fictional profile; the client page is read-only and **direct client acceptance/withdrawal API calls are blocked in fictional mode**. For Round 30 signed-in acceptance, all three Clerk test users must have different verified primary emails, be in the *same development/test Clerk instance*, and have no MFA/session tasks. Optional `CHESS_DEMO_E2E_BASE_URL=http://127.0.0.1:3000` is **local only**; port 3000 must be free. Round 33 requires an authenticated, protected demonstration of mixed business roles: keep one fictional business as the employee's SUPPORT assignment, temporarily authorize that same test identity as MANAGER of another fictional business, verify manager-only finance links and no unrelated owner/admin controls, revoke the manager assignment and confirm navigation and API denial. Reset fixtures after the test, and manually inspect keyboard/screen-reader access, business-switching, empty queues and consent-status failures. Use the **same isolated development Clerk/Neon identities** already specified here; no new vendor keys or live client data are required. Normal GitHub CI checks source syntax and environment policy, NOT actual authenticated browser execution. A protected run with genuine Clerk test accounts and the separate Neon database is still required. See the README `npm run demo:setup`, `npm run demo:verify`, `npm run test:e2e`, [Round 30 browser acceptance](CHESS_CORP_2_ROUND30_BROWSER_ACCEPTANCE.md), and [Round 33 manager-versus-staff and usability source register](CHESS_CORP_2_ROUND33_DEMO_USABILITY.md). **Not necessary for normal CI; forbidden for real money/client work.**
- [ ] **02 · P1 · Separate protected application/database/identity infrastructure (M1, M2, M3, M8).** Supply a reviewed private HTTPS **staging** deployment (not the production `main` site), real but **test-only** per-tenant Neon runtime credentials and distinct **non-pooled migration** URLs with correct schemas, restricted runtime roles, managed secret vault, Clerk **test** publishable/secret keys, trusted origins/redirects, verified test identities and approved tenant/business fixture IDs. Place `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_DEFAULT_TENANT`, `NEXT_PUBLIC_ROOT_DOMAIN`, `NEXT_PUBLIC_APP_URL`, `CHESS_PUBLIC_ORIGIN` in the protected host/vault; use different scoped values per stage. Provide two separate tenant HTTPS origins for independent authorization testing. Review the exact legal entity mapping and the list of people authorized to access each business.

- [ ] **03 · P1/P2 · Legal company and staff/role evidence (M1, M2, M6).** Provide the actual ownership/legal-entity registry, legal names, beneficial ownership evidence, EIN and business-to-entity mapping **only through approved legal storage**; assign each CHESS business to its correct licensed entity. Identify owner/admin, service manager, practicing licensed professional, independent reviewer, financial operator and authorized release owner. Supply fictional staging accounts for **at least three distinct** actual Clerk identities and separate no-grant/revoked-user scenarios. Obtain signed legal/privacy approval of cross-business client sharing, firm employment/sponsorship, delegated staff permissions and role revocation. **No automatic cross-KOBIA-tenant identity matching or calendar merging** without a new privacy decision.

- [ ] **04 · P1/P2 · Client identity, consent and e-sign evidence (M3, M6).** Provide named approved consent policy versions and complete disclosure text, withdrawal and expiration policy, consent purpose taxonomy, a formal **e-signature provider** (HTTPS sandbox/API, scoped credentials, signature/evidence/retention contract) where legally required, and counsel's sign-off on which workflows need a legally enforceable signature. Provide a unique, strong secret `CHESS_CONSENT_EVIDENCE_KEY` from a vault plus old-key verification/rotation retention. For the existing disabled-by-default portal, do not activate `CHESS_CLIENT_CONSENT_PORTAL_ENABLED`, `CHESS_CLIENT_PORTAL_POLICY_APPROVED` or `CHESS_CLIENT_PORTAL_IDENTITY_APPROVED` until verified customer-email/account-recovery and multi-business privacy tests pass. HMAC evidence is **not** a legal e-signature. Sign off retention, subject access/deletion and legal-hold release policy before any purge logic. Keep `CHESS_DOCUMENT_LIFECYCLE_ENABLED` and `CHESS_DOCUMENT_RETENTION_POLICY_APPROVED` false unless the document legal-hold/suppression/retention process is independently authorized.

- [ ] **05 · P1/P2 · Private versioned object storage and malware scanning (M3, M8).** Supply a **private** versioned S3/S3-compatible bucket with encryption/KMS, object lock/retention policy as applicable, least-privilege short-lived IAM, encrypted logs and signed DPA; exact stage-specific settings: `KOBIA_S3_BUCKET`, `KOBIA_S3_REGION`, `KOBIA_S3_ACCESS_KEY_ID`, `KOBIA_S3_SECRET_ACCESS_KEY`, optional `KOBIA_S3_ENDPOINT`. Verify presigned PUT/HEAD/versioned GET, correct CORS and bucket versioning **Enabled**. Supply isolated ClamAV (`CHESS_CLAMAV_HOST`, `CHESS_CLAMAV_PORT`) and a **distinct** `CHESS_SCAN_WORKER_TOKEN`; alternatively obtain approval for signed scanner callback using `CHESS_DOCUMENT_SCAN_KEY` and default-off `CHESS_SCAN_CALLBACK_ENABLED`. Supply sandbox CLEAN **and** INFECTED evidence. Do not release unscanned objects or assume issued presigned links are immediately revocable.

- [ ] **06 · P1/P2 · Internal scheduler, employee calendar and notifications (M4, M8).** Select/contract an approved calendar gateway with employee-specific Google/Microsoft delegated OAuth/PKCE, token refresh/revoke, create/status/cancel idempotency contract and signed DPA. Supply `CHESS_CALENDAR_API_URL`, `CHESS_CALENDAR_CANCEL_API_URL`, `CHESS_CALENDAR_STATUS_API_URL`, `CHESS_CALENDAR_ALLOWED_HOST`, `CHESS_CALENDAR_API_KEY`, plus `CHESS_CALENDAR_OAUTH_START_URL`, `CHESS_CALENDAR_OAUTH_STATUS_URL`, `CHESS_CALENDAR_OAUTH_REVOKE_URL`, `CHESS_CALENDAR_OAUTH_ALLOWED_HOST`, `CHESS_CALENDAR_OAUTH_API_KEY`. Keep `CHESS_CALENDAR_OAUTH_ENABLED`, `CHESS_CALENDAR_OAUTH_PROVIDER_CERTIFIED`, `CHESS_CALENDAR_SYNC_ENABLED` OFF until approved. Supply worker scheduler/on-call owner, scoped `CHESS_WORKFLOW_WORKER_TOKEN`, a real `CHESS_ACTIVE_TENANT_SLUGS` allowlist, and approve `CHESS_SCHEDULER_ENABLED` separately. Decide optional email/SMS provider and employee consent, data retention and overdue notification policy; **not required to keep in-app alerts**. Approve and observe the Round 29 recurring-worker fairness migration and backlog alerts in a protected, loaded staging tenant; the last-inspected timestamp now appears on the manager recurrence screen but remains only an inspection signal, not employee task completion. In protected staging, demonstrate blocked/deferred template recovery and actual scheduler monitoring before relying on the display.

- [ ] **07 · P1/P2 · Bank feed, accounting mapping and supervised ledger (M5, M7).** Contract an approved Plaid-backed bank gateway (or formally approve a different, newly integrated provider), customer bank-feed consents, opaque bank account mappings, signed webhook/disconnect handling, statement access, and provider sandbox. Supply `CHESS_BANK_FEED_API_URL`, `CHESS_BANK_FEED_ALLOWED_HOST`, `CHESS_BANK_FEED_API_KEY`, `CHESS_BANK_FEED_SOURCE=PLAID`; keep `CHESS_BANK_FEED_ENABLED`, `CHESS_BANK_FEED_IMPORT_ENABLED`, `CHESS_BANK_FEED_PAGINATION_ENABLED` OFF pending approval. Supply real approved accounting entities, USD bank/chart-of-accounts and journal/period-close policies, authorized 3-person creator/reviewer/poster identities, and independently checked reconciliations, reversal policy and period-close/DR evidence. Keep **all four** ledger switches OFF: `CHESS_BANK_POSTING_ENABLED`, `CHESS_BANK_POSTING_POLICY_APPROVED`, `CHESS_BANK_POSTING_BANK_SANDBOX_APPROVED`, `CHESS_BANK_POSTING_OPERATOR_APPROVED`. No green CI run authorizes ledger posting with live money. The new Round 31 read-only `/app/financial-attempts` status monitor is not a financial reconciler: the owner must provide an authorized independent bank/legacy-GL operator, proof of resolved EXECUTING/UNKNOWN attempt outcomes, source-journal/consent race tests, and finance signoff in protected staging before any real posting is enabled. No new monitoring secret is required. Cross-database consent revocation and settlement races remain open design/release risks.

- [ ] **08 · P1/P2 · Certified payroll funding, pay runs and remittances (M5).** Contract an actual compliant payroll processor; obtain DPA, payroll tax calculation/filing and bank ACH authorization terms, employer/employee enrollment, funding/segregation controls, fictional test **POSTED** pay run, provider reconciliation receipts and independent legal/payroll acceptance. Supply `CHESS_PAYROLL_API_URL`, `CHESS_PAYROLL_STATUS_API_URL`, `CHESS_PAYROLL_ALLOWED_HOST`, `CHESS_PAYROLL_API_KEY`. Leave `CHESS_PAYROLL_APPROVAL_REQUESTS_ENABLED`, `CHESS_PAYROLL_PROVIDER_CERTIFIED`, `CHESS_PAYROLL_EXECUTION_ENABLED`, `CHESS_PAYROLL_STATUS_ENABLED` OFF until separately approved. Provide 3 distinct actual human requester/reviewer/operator test identities and evidence that approvals match a **server-computed fingerprint** for the same posted run. **Before deployment of migration 20261111340000**, supply a backup and supervised reconciliation for any existing duplicate `PAYROLL_EXECUTE` business/source fingerprints; do not delete historical approvals. Vendor "paid" statuses alone do not prove wage receipt or tax settlement.

- [ ] **09 · P1/P2 · Tax return preparation/e-file authority (M5).** Select a genuine professional tax-preparation/e-file system with API contract and fictional sandbox, client engagement/e-file signature consent, authorized PTIN/EFIN/company roles and state/federal requirements, separate preparer/reviewer/authorized transmitter, record retention, e-file acceptance/reject/status contracts and incident/retry policy. Current CHESS tax workpapers are **review metadata, not tax returns**; no production tax submission credentials exist in the CHESS adapter until a vendor is selected and implemented. Supply official credentials **only through the tax vendor's protected channel**, not repo/chat.

- [ ] **10 · P1/P2 · Official professional registries and firm affiliation (M2, M6).** Obtain official/contracted access to current NMLS individual/company sponsorship (mortgage), state DOI/appointments (insurance), DRE/responsible-broker (real estate) and CRD/IARD/FINRA/SEC/state registrations and supervision (investments) as applicable. Supply public practitioner/firm registry IDs, jurisdictions, license categories and documented independent responsible licensed reviewer. Configure `CHESS_LICENSE_API_URL`, `CHESS_LICENSE_ALLOWED_HOST`, `CHESS_LICENSE_API_KEY`, `CHESS_LICENSE_SOURCE_HOSTS`, `CHESS_AFFILIATION_API_URL`, `CHESS_AFFILIATION_ALLOWED_HOST`, `CHESS_AFFILIATION_API_KEY`, `CHESS_AFFILIATION_SOURCE_HOSTS`; keep `CHESS_AFFILIATION_VERIFICATION_ENABLED` OFF until approved. Do not equate ownership of an individual credential with company/broker permissions.

- [ ] **11 · P1/P2 · Four separate licensed partner systems (M6).** Name and contract the partners for **MORTGAGE, INSURANCE, REAL_ESTATE, INVESTMENTS**, their signed DPAs, referral/record permissions, disclosures, supervision, licensed-system API scopes and actual regulated execution arrangements. For **non-transactional opaque coordination ONLY**, supply `CHESS_REGULATED_HANDOFF_API_URL`, `CHESS_REGULATED_STATUS_API_URL`, `CHESS_REGULATED_ALLOWED_HOST`; one opaque partner ID each in `CHESS_REGULATED_PARTNER_MORTGAGE`, `CHESS_REGULATED_PARTNER_INSURANCE`, `CHESS_REGULATED_PARTNER_REAL_ESTATE`, `CHESS_REGULATED_PARTNER_INVESTMENTS`, plus separately scoped `CHESS_REGULATED_PARTNER_<SERVICE>_API_KEY` secrets. The older single `CHESS_REGULATED_API_KEY` in historical notes is **not** an acceptable substitute for the current per-service scope. The gateway must return matching `tenantSlug,businessId,serviceCaseId,workflowId,service,partnerId,status` and a correlatable ID for accepted/pending. Leave `CHESS_REGULATED_HANDOFF_ENABLED`, `CHESS_REGULATED_RESPONSE_BINDING_REQUIRED` OFF until certified. The adapter does **not** originate mortgages, bind insurance, transact real estate or trade securities.

- [ ] **12 · P1/P2 · AI gateway governance (M7).** Contract a privacy-approved, no-PII **metadata-only** AI gateway; obtain `CHESS_AI_TRIAGE_API_URL`, `CHESS_AI_ALLOWED_HOST`, `CHESS_AI_API_KEY`, vendor DPA/retention/deletion/cost statements and confirmed metering response, daily quota/rate policy, human-review owner. Keep `CHESS_AI_TRIAGE_ENABLED`, `CHESS_AI_DATA_SHARING_APPROVED`, `CHESS_AI_VENDOR_DPA_APPROVED`, `CHESS_AI_COST_LIMIT_APPROVED` OFF. `CHESS_AI_DAILY_CALL_LIMIT` may be configured (1–100; conservative default). Approval covers only task triage/follow-up, **not** financial, credit, insurance or investment decisions.

- [ ] **13 · P1/P2 · Invoice vendor and merchant observations/settlement (M7).** Contract an invoice-only, no-autocharge vendor and a separately certified merchant/payment provider if collection is desired; obtain service-specific billing consent, verified merchant customer mapping, three-person approval workflow, accurate taxes/refunds/chargebacks/PCI scope, settlement and payout reconciliation agreement. Invoice delivery settings: `CHESS_BILLING_DELIVERY_API_URL`, `CHESS_BILLING_STATUS_API_URL`, `CHESS_BILLING_ALLOWED_HOST`, `CHESS_BILLING_API_KEY`, and OFF flags `CHESS_BILLING_DELIVERY_ENABLED`, `CHESS_BILLING_VENDOR_CERTIFIED`. Monthly **draft-only** plans additionally require approval of `CHESS_BILLING_RECURRING_DRAFTS_ENABLED` and `CHESS_BILLING_RECURRING_POLICY_APPROVED` (default OFF); provide a scheduler response monitor for `backlog=true` / HTTP 503 after a capped 500-plan run. Merchant observations require `CHESS_MERCHANT_PROVIDER_ID`, vault-held `CHESS_MERCHANT_WEBHOOK_HMAC_KEY` and independently approved `CHESS_MERCHANT_WEBHOOK_ENABLED`, `CHESS_MERCHANT_VENDOR_CERTIFIED`, `CHESS_MERCHANT_SETTLEMENT_POLICY_APPROVED`. **Neither a merchant event nor an invoice sent is cash collected.**

- [ ] **14 · P1/P2 · Statutory accounting, financial close and reporting (M5, M7).** Supply accountant/CFO-approved legal entity ownership, all active COA/bank/GL mappings, reconciled historical and current ledger entries, approved intercompany transactions/eliminations, correct revenue recognition, period lock/reversal rules, annual/quarterly close policies and qualified independent financial-statement sign-off. Frozen CHESS **operational snapshots** are not GAAP/IFRS audited statements. A real statutory consolidation, cash application and recognized revenue close remain open engineering and accounting validation work; no external credentials alone can finish these.

- [ ] **15 · P1/P2 · Independent audit archive and operational pager (M8).** Contract a remote immutable/WORM receipt service with signed retention/legal-hold/DPA, independent incident escalation and on-call roster. Supply `CHESS_AUDIT_ARCHIVE_URL`, `CHESS_AUDIT_STATUS_URL`, `CHESS_AUDIT_ALLOWED_HOST`, `CHESS_AUDIT_ARCHIVE_API_KEY`, a distinct vault secret `CHESS_AUDIT_HASH_KEY`, and keep `CHESS_AUDIT_EXPORT_ENABLED` / `CHESS_AUDIT_RETENTION_APPROVED` OFF until actual receipts are verified. Supply on-call policy, real alarm destination, test-only `CHESS_INCIDENT_MONITOR_TOKEN`, and approval for `CHESS_INCIDENT_MONITOR_ENABLED` / `CHESS_INCIDENT_MONITOR_OPS_APPROVED` (OFF initially). Audit WORM receipt verification and a failed-delivery drill must pass separately. Round 32 tenant-wide worker/calendar/archive health is now source-gated to a current OWNER/ADMIN and audited in a serializable transaction. Verify role downgrade and audit-write outage fail closed in protected staging; supply the **actual** immutable archive ALLOW/DENY receipts and alert/pager acknowledgment rather than treating the dashboard as a WORM service. Internal dashboard health is not an external pager.

- [ ] **16 · P1/P2 · Backups, test-only restore, migrations and cryptographic roles (M3, M5, M8).** Provide encrypted PostgreSQL PITR and versioned compliance-locked offsite object backups, a source-DB owner authorized to run migrations, and a distinct **non-admin, SELECT-only, sslmode=verify-full** connection to a truly isolated restored clone. Configure protected manual `chess-dr-restore` environment: `CHESS_DR_RESTORE_DATABASE_URL`, `CHESS_DR_RESTORE_ALLOWED_HOST`, `CHESS_DR_TEST_TENANT`, `CHESS_DR_WITNESS_SECURITY_EVENT_ID`, `CHESS_DR_WITNESS_CONSENT_ID`, `CHESS_DR_WITNESS_INVOICE_ID`, `CHESS_DR_BACKUP_BUCKET`, `CHESS_DR_BACKUP_OBJECT_KEY`, `CHESS_DR_BACKUP_OBJECT_VERSION`, `CHESS_DR_BACKUP_REGION`, optional `CHESS_DR_BACKUP_ENDPOINT`, `CHESS_DR_BACKUP_ALLOWED_HOST`, scoped `CHESS_DR_BACKUP_ACCESS_KEY_ID`, `CHESS_DR_BACKUP_SECRET_ACCESS_KEY`, `CHESS_DR_REQUIRE_PG_SSL=true` and `CHESS_DR_MAX_BACKUP_AGE_HOURS`. A qualified operator must provide **actual** start/ready and source/restored timestamps, agreed RTO/RPO targets, `CHESS_DR_EVIDENCE_TICKET` and signed witness notes; `CHESS_DR_VALIDATE` / `CHESS_DR_ISOLATED_RESTORE` are test-only approvals. Run migrations on a backed-up clone, audit any legacy consent and duplicate-payroll rows, measure integrity/rollback and preserve evidence before touching real tenant schemas. Specifically rehearse additive tenant migration `20261112002000_chess_m4_recurrence_worker_fairness` for `ChessWorkRecurrence.lastInspectedAt`, along with the previously recorded M5 financial-attempt reservation migration; record rollback plan and verify existing tenant data survives. For the **separately protected, SELECT-only legacy consent inventory** (not a migration), supply `CHESS_CONSENT_AUDIT_DATABASE_URL` (restricted secret), `CHESS_CONSENT_AUDIT_ALLOWED_HOST`, `CHESS_CONSENT_AUDIT_TENANT`, `CHESS_CONSENT_AUDIT_REVIEW_TICKET`, and enable test-only `CHESS_CONSENT_AUDIT_ENABLED` / `CHESS_CONSENT_AUDIT_ISOLATED` only after an authorized reviewer approves the production-like clone.

- [ ] **17 · P1 · Protected staging, signed-in roles and vendor sandboxes (all milestones).** Provide **two** separately deployed fictional HTTPS tenant origins, explicit business/case IDs, valid and revoked purpose-specific consents, distinct Clerk owner/admin, manager, practitioner, no-grant member and client identities, and their **temporary test session cookies** via protected GitHub environments. For app attestation set `CHESS_RELEASE_SHA`, `CHESS_STAGING_EXPECTED_SHA`, `CHESS_STAGING_BASE_URL`, `CHESS_STAGING_ALLOWED_HOST`, `CHESS_STAGING_ATTESTATION_TOKEN`, plus guarded `CHESS_STAGING_ATTESTATION_ENABLED` / `CHESS_STAGING_VALIDATE`. For real 2-tenant role checks use `CHESS_AUTHZ_E2E_BASE_URL`, `CHESS_AUTHZ_E2E_OTHER_TENANT_URL`, `CHESS_AUTHZ_E2E_ALLOWED_HOSTS`, `CHESS_AUTHZ_E2E_ATTESTATION_TOKEN_A` and `_B` (distinct), `CHESS_AUTHZ_E2E_RELEASE_SHA`, scoped unit/case IDs and manager/no-grant session-cookie secrets. Create protected environments and manually approve/run the existing **calendar, bank-feed, payroll-status, regulated, AI/invoice, audit, E2E, DR and staging** fictional-sandbox workflows. Their `CHESS_*_SANDBOX_VALIDATE` / `*_ISOLATED` flags are test-only; no real staff, client, bank, wage, property, patient or taxpayer records may be used. Capture real test output and clean up synthetic vendor resources. For Round 35 acceptance, stage two businesses with disjoint support/manager memberships and two fictional clients, then exercise revoked-OWNER business creation, revoked staff assignment, client-service grant updates, the consent-scoped regulated case directory, AI/approval sensitive reads and audit-write fault injection; prove no private data or unauthorized mutations escape a failed source transaction. Independently verify identity-minimal ALLOW/DENY events and restore fixture roles afterward. For Round 33 signed-in usability acceptance, explicitly test an unauthorized `?businessId=` link returning an unavailable state (without fallback to an unrelated authorized unit), manager-to-SUPPORT role loss during navigation and form editing, empty-versus-failed work/alert reads, failed calendar-preference read (must not say OFF), and an assignment picker populated only with eligible staff in that business. Include keyboard focus, mobile viewport and screen-reader evidence; this is **not** proven by source render tests. For Round 32 sensitive-read acceptance, include verified client sign-in, email/contact ownership reassignment, a foreign Clerk account with the same historical consent, an expired/withdrawn disclosure, an OWNER-to-MEMBER downgrade during worker-health requests, and audit-insert failure injection. Verify that denied client disclosures and tenant-wide worker metrics are not released, and that the tenant audit ledger records privacy-minimal ALLOW/DENY decisions. Do not use real client or employee records; this remains independently blocked until the protected identities and two-tenant staging sessions exist.

- [ ] **18 · P2 · Independent security, privacy, legal and licensed release authorizations (M1–M8).** Supply named third-party **penetration-test** findings and retest, authenticated cross-tenant/browser roles, real keyboard/screen-reader **accessibility** testing (especially Round 33 mixed manager/SUPPORT menus, revoked-unit navigation, actionable empty/error alerts and calendar consent unknown state), load/chaos/missed-scheduler tests, high/critical dependency review, managed secret scanning + GitHub push protection, GDPR/CCPA-style retention and erasure policy where applicable, signed data-processing agreements, professional-practice/sponsorship approvals and proof of supervised separation of duties. Name the actual security, legal/privacy, finance, regulated-services, operations and final release **approvers**. After all gates, approve a scoped staging pilot, versioned migration/backout plan, backup/PITR rehearsal, change freeze, limited cutover and signed production go/no-go. **No merge to main and no production Vercel deployment is authorized by this checklist.**

## Required order and safe handling

1. **Demo first (optional):** item **01** only, in an isolated test environment. It never calls real financial/regulated vendors.
2. **Enable protected staging:** items **02–06** (identity, company/roles, consent, secure storage, calendar/worker) with fictional fixtures.
3. **Service-specific sandboxes:** items **07–14** only for services you are legally authorized to provide; do not enable execution flags before **independent written approval**.
4. **Independently verify and release:** items **15–18** (audit/WORM, DR, role/E2E/sandbox evidence, external audit/qualified sign-offs). Production is a **separate decision**.
5. **Defer by choice:** cross-tenant identity matching and cross-tenant shared-calendar conflict detection are **not prerequisites** unless you explicitly authorize those as new features and obtain legal/privacy approval; optional SMS/email and optional merchant collection are not required for the basic internal employee workflow.

## Exact protected test-environment variable groups (not additional owner tasks)

These are **sub-fields of item 17**, not a second checklist. Supply in named protected GitHub Environments only, and use vendor-issued *sandbox* values:

| Protected environment | Validation-only variables / sample IDs |
| --- | --- |
| `chess-calendar-sandbox` | `CHESS_CALENDAR_SANDBOX_VALIDATE`, `CHESS_CALENDAR_SANDBOX_ISOLATED`, `CHESS_CALENDAR_SANDBOX_TENANT`, `CHESS_CALENDAR_SANDBOX_BUSINESS_ID`, `CHESS_CALENDAR_SANDBOX_STAFF_ID` |
| `chess-bank-feed-sandbox` | `CHESS_BANK_FEED_SANDBOX_VALIDATE`, `CHESS_BANK_FEED_SANDBOX_ISOLATED`, `CHESS_BANK_FEED_SANDBOX_ACCOUNT_REF` |
| `chess-payroll-sandbox` | `CHESS_PAYROLL_SANDBOX_VALIDATE`, `CHESS_PAYROLL_SANDBOX_ISOLATED`, `CHESS_PAYROLL_SANDBOX_TENANT_ID`, `CHESS_PAYROLL_SANDBOX_ENTITY_ID`, `CHESS_PAYROLL_SANDBOX_PAYRUN_ID`, `CHESS_PAYROLL_SANDBOX_PROVIDER_REQUEST_ID`, `CHESS_PAYROLL_SANDBOX_IDEMPOTENCY_KEY` |
| `chess-regulated-sandbox` | `CHESS_M6_SANDBOX_VALIDATE`, `CHESS_M6_SANDBOX_ISOLATED`, `CHESS_M6_SANDBOX_SERVICE`, `CHESS_M6_SANDBOX_TENANT`, `CHESS_M6_SANDBOX_BUSINESS_ID`, `CHESS_M6_SANDBOX_PRACTITIONER_REGISTRY_ID`, `CHESS_M6_SANDBOX_FIRM_REGISTRY_ID`, `CHESS_M6_SANDBOX_JURISDICTION` |
| `chess-m7-sandbox` | `CHESS_M7_SANDBOX_VALIDATE`, `CHESS_M7_SANDBOX_ISOLATED`, `CHESS_M7_SANDBOX_TENANT`, `CHESS_M7_SANDBOX_BUSINESS_ID` |
| `chess-staging` (protected legacy consent inventory) | `CHESS_CONSENT_AUDIT_ENABLED`, `CHESS_CONSENT_AUDIT_ISOLATED`, `CHESS_CONSENT_AUDIT_TENANT`, `CHESS_CONSENT_AUDIT_DATABASE_URL`, `CHESS_CONSENT_AUDIT_ALLOWED_HOST`, `CHESS_CONSENT_AUDIT_REVIEW_TICKET` (manual `chess-consent-legacy-audit.yml`, SELECT-only) |
| `chess-audit-sandbox` | `CHESS_AUDIT_SANDBOX_VALIDATE`, `CHESS_AUDIT_SANDBOX_ISOLATED`, `CHESS_AUDIT_SANDBOX_TENANT` |
| `chess-authz-e2e` | `CHESS_AUTHZ_E2E_VALIDATE`, `CHESS_AUTHZ_E2E_ISOLATED`, `CHESS_AUTHZ_E2E_BUSINESS_ID`, `CHESS_AUTHZ_E2E_OTHER_BUSINESS_ID`, `CHESS_AUTHZ_E2E_SERVICE_CASE_ID`, `CHESS_AUTHZ_E2E_OTHER_CASE_ID`, `CHESS_AUTHZ_E2E_MONTH`, `CHESS_AUTHZ_E2E_MANAGER_COOKIE`, `CHESS_AUTHZ_E2E_NO_GRANT_COOKIE` |
| `chess-dr-restore` | `CHESS_DR_VALIDATE`, `CHESS_DR_ISOLATED_RESTORE`, `CHESS_DR_DRILL_STARTED_AT`, `CHESS_DR_RESTORE_READY_AT`, `CHESS_DR_SOURCE_LATEST_AT`, `CHESS_DR_RESTORED_LATEST_AT`, `CHESS_DR_RTO_TARGET_MINUTES`, `CHESS_DR_RPO_TARGET_MINUTES`, `CHESS_DR_EVIDENCE_TICKET` |
| `chess-staging` | `CHESS_STAGING_VALIDATE`, `CHESS_STAGING_EXPECTED_SHA`, `CHESS_STAGING_BASE_URL`, `CHESS_STAGING_ALLOWED_HOST` |

## Record of acceptance (fill only after evidence exists)

Do **not** replace an open checkbox merely because an API key is present. For each numbered item above, require: (i) provider/account owner, (ii) DPA/license or scope evidence, (iii) source vault path **without its secret**, (iv) reviewed test tenant/SHA, (v) external sandbox/restore/accessibility test link, (vi) independent approver identity, (vii) signed acceptance date, and (viii) expiry/review and revocation/rollback owner.

**Current verified external acceptance count:** not established by repository CI; treat the entire list as **OPEN FOR VERIFICATION**. The technical detail behind these fields remains in the archived, versioned `docs/CHESS_CORP_2_EXTERNAL_CONFIGURATION.md`, not in separate active owner to-do lists.

**Non-negotiable:** Never paste Neon URLs, Clerk secrets, provider API keys, HMAC keys, private session cookies, customer identifiers, or live tax/license credentials into ChatGPT, commits, pull-request comments or issues. Use secret manager / protected GitHub environment, with restricted access, rotation and audit.
