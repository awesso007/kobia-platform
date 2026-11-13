# CHESS CORP 2 - Development milestones and release gates

Branch: `feature/operations-overview`
Pull request: https://github.com/awesso007/kobia-platform/pull/24

KOBIA is the independent platform. The code below is a CHESS-specific
business-operations layer within an isolated KOBIA tenant, not an assertion
that a single legal entity holds all operating licenses.


## CURRENT / AUTHORITATIVE — Round 53 milestone matrix (Rounds 31–53 engineering)


**This table is the current M1–M8 development and release-gate matrix.**
The detailed Round 24 matrix below is historical and must not be mistaken for
the latest code inventory. Round 48 secures selected public and machine entrypoints; Round 51 adds ACTIVE tenant and atomic reservation checks to the three public booking routes. Round 49 adds
specific authenticated mutation protections and full inventory source
gating. Round 50 replaces the historical authenticated response-release
audit with a transaction-bound SELECT and audit boundary, including a
separate legacy accounting/tRPC transaction scope. Neither modification
establishes complete cross-business authorization, external immutable
receipt custody or protected staging acceptance. Each row separates **implemented and CI-verified
source** from **incomplete engineering or real-world acceptance**.

| Milestone | Implemented source and test scope through Round 46 (exact final CI status below) | Outstanding engineering, protected staging and independent evidence | Owner-supply groups | Production gate |
| --- | --- | --- | --- | --- |
| **M1 — Shared profiles, authorization and sensitive reads** | Tenant-scoped client profiles, service grants and revocation; transaction-coupled ALLOW/DENY access audit for selected directories; Round 32 verified-client consent index/disclosure reads with same-transaction identity checks; Round 33 owner/manager/staff link separation; Round 35 business/regulated directory and client profile/link/grant writes now recheck live authorization in audited serializable transactions; Round 36 legacy 1099 tax exports require live finance roles/audit; Round 37 legacy GL/TB CSV, file/document, mail and selected workflow/form reads add live role/audit guards, while 162 historical API route files are inventoried; Round 41 applies a serializable, audit-coupled live role/business/assignment check to employee task-list reads; Round 43 source adds 41 authenticated historical GET audit-before-release wrappers, global search read-only POST response audit, protected tRPC successful-query legacy audit and explicit tenant selector; Round 48 removes payment stub settlement, exact-binds inbound mail to active tenant/mailbox, enforces signed expiring public tracking capabilities, strengthens booking cancellation and inventories legacy API method entrypoint controls; Round 49 hardens explicit-tenant module selection, LOCAL uploads, nested forms/sites/workflow resources, private chat and DM membership, and gates classified non-GET admission in CI; Round 50 moves all inventoried authenticated historical GETs into either a serializable tenant SELECT+membership+security-event transaction (39 routes), a previously verified scoped profile SELECT transaction (2 routes), or a separate legacy-ledger tRPC protected query+membership+AuditLog transaction (1 route). The read-only search POST uses the tenant transaction wrapper. | Transaction-coupled historical read source now covers inventoried authenticated GET/read-only search paths, but NOT all helper-internal independent DB access, platform PUBLIC/machine reads or all business/client grant selectors; mutation responses, 9 public capability and 26 machine callbacks need separate review; external immutable audit receipts, authenticated two-tenant and multi-business role/grant revocation races and legal data-sharing approval remain outstanding | **01,02,03,15,17,18** | **PARTIAL CODE — BLOCKED** |
| **M2 — Business units and employee assignments** | Business unit provisioning and atomic assignment/service-grant revocation; Round 33 current MANAGER assignment selects only authorized finance units, revoked deep links no longer fall back to a different business, and business-local admin forms reset on unit change; Round 35 business/staff provisioning and assignment directories recheck live roles and append immutable events atomically | Real legal-company/firm and licensed-staff records, staged proof of active vs revoked roles, cross-business employee separation and least-privilege review | **01,02,03,10,17,18** | **PARTIAL CODE — BLOCKED** |
| **M3 — Client consent, onboarding and documents** | Policy/purpose versioned consent, default-OFF verified Clerk client preview, withdrawn/expired-state guards, audit-coupled verified-own-consent reads (Round 32), reduced directory exposure, private version/scan/hold document controls in source; Round 37 legacy direct document download audited and insecure email-only helpdesk portal disabled; Round 39 added immutable revisions, scan-then-independent-review redaction, two-actor disposal decision, default-OFF exact-version S3 purge/UNKNOWN audit source and employee panel; Round 41 adds third-party UNKNOWN reconciliation, exact one-version-before/zero-versions-after private S3 inventory, tenant prefix and live signers/hold rechecks; Round 45 adds DB-enforced descendant retention/hold/suppression inheritance, strict S3 HEAD and single-version confirmation with atomic upload audit, one-time scan with version inventory, post-scan independent byte-verified redaction review/attestation, and employee UNKNOWN read-only reconciliation UI with unit and real PostgreSQL tests | Counsel-approved jurisdiction-specific retention/disclosure/e-signature and hold-release/erasure policy; genuine client acceptance/withdrawal and verified separate reviewer sessions; protected S3 versioning, Object Lock/WORM/scanner, ListBucketVersions IAM, real redaction QA including hidden layers, backup/replica erasure and witnessed restore; independent audit archive and external signoff | **01,02,04,05,16,17,18** | **PARTIAL CODE — BLOCKED** |
| **M4 — Tasks, recurrences and calendar** | Employee queue, alerts, manager reassignment, appointment conflict checks and calendar consent; Round 29 fairness worker persists inspection time, Round 31 screen displays it; Round 33 named staff selector, actionable empty/permission states, no false OFF when calendar preference lookup fails, business-keyed UI; Round 40 extended protected demo-browser employee/manager workflow and stale task conflict scenarios; Round 41 rechecks live roles, business assignments, target assignees and client links within serializable, audit-coupled task creation/transition, and audits work-item lists; Round 46 adds six protected browser test cases covering two-tab 409 resolution, cross-business POST/PATCH denial, calendar+appointment opt-in/opt-out persistence and mobile employee/client WCAG checks | Real deployed recurring worker/pager and backlog checks, Google/Microsoft delegated OAuth sandbox and cancel confirmations, signed-in revocation/consent and accessible mobile/keyboard/screen-reader tests; optional cross-tenant calendar conflict service deferred | **01,02,03,06,15,17,18** | **PARTIAL CODE — BLOCKED** |
| **M5 — Accounting, bookkeeping, payroll and tax** | Case/GL mapping, reviewed bank suggestions, default-OFF three-actor journal execution, durable RESERVED/EXECUTING/UNKNOWN states, consent-row locking, read-only legacy GL reconciliation; Round 31 **manager-only read-only attempt monitor** and Round 33 finance manager business deep links and honest no-grant empty state; Round 38 added opt-in dual-disposable-Postgres fault tests for lost ACK, rollback, UNKNOWN, duplicate reservations, consent withdrawal and idempotent receipt pinning; Round 41 adds default-OFF independent fourth-person receipt-only UNKNOWN resolution, blocks fabricated no-attempt replay and requires stale EXECUTING before reconciliation; Round 44 expands the isolated dual-disposable-PostgreSQL failure suite from 6 to **14 cases** (reservation ACK timeout, simultaneous post collision, mismatched idempotency identity, source-claim rollback, deactivated bank rollback, read timeout, receipt concurrency and alternate-source replay) | Independent protected-cluster **cross-database UNKNOWN and consent race** acceptance beyond Round 38 isolated CI simulation; four-person resolution in witnessed staging, documented human procedure for UNPOSTED/DIVERGED exceptions, certified bank/payroll/tax vendors, actual wage/tax receipts, legal/finance approvals; **no live posting/funding/e-file** | **01,07,08,09,14,16,17,18** | **PARTIAL CODE — LIVE FINANCIAL EXECUTION OFF** |
| **M6 — Mortgage, insurance, real estate and investments** | Official-source verification adapters, service-specific consent and opaque licensed-partner coordination with UNKNOWN resolution; Round 33 revoked-business links fail closed; Round 35 regulated case directory exposes only currently granted, client-consented case ID/service via one audited transaction instead of unlogged overfetch | Current professional/firm sponsorship evidence, certified partner APIs and legal sector disclosures, independent licensed review, real execution-systems validation; **no origination/binding/closing/trading** | **03,04,10,11,17,18** | **PARTIAL COORDINATION CODE — REGULATED EXECUTION OFF** |
| **M7 — AI triage, invoicing and reporting** | Budgeted metadata-only AI review and human approval, consent-bound invoice drafts/vendor observations, fairness-capped **draft-only** recurring billing and immutable operational snapshots; Round 33 business-scoped billing, approval and bank-feed forms reset; revoked billing link cannot silently select another company; Round 35 AI suggestions/budget/worker reads and approval inbox are role-rechecked and audit-coupled, actor IDs removed from browser review payloads, and report/AI screens fail closed on revoked unit links | Certified AI/invoice/merchant contracts and DPAs; actual settlement, chargeback/refund and tax policies; accountant-controlled ledger close, statutory consolidation and financial-statement review; **no real money or GAAP/IFRS close** | **12,13,14,15,17,18** | **PARTIAL CODE — COLLECTION/STATUTORY REPORTING OFF** |
| **M8 — Security, CI, E2E and recovery** | Versioned migrations, tenant audit and monitoring; Round 32 OWNER/ADMIN worker/calendar/archive health reads now use a serializable access audit; Round 33 role-based menus and error states; Round 35 audited business/staff/AI/approval/regulated source reads, atomic M1/M2 writes, and added negative regressions; Round 36 legacy tax export restrictions and Round 37 selected historical read guards, short-lived local file capability, disabled insecure helpdesk login and explicit unreviewed-route inventory; Round 38 final commit passed **3/3** normal CI jobs with the dual-Postgres finance fault suite; Round 40 adds browser test source-policy and isolated demo fixture integrity checks; Round 41 adds isolated unit checks for ambiguous document S3 inventory, separate reviewers and bank replay controls; authenticated browser run remains manual; Round 44 adds eight executable two-database financial fault scenarios; Round 45 adds versioned document lineage migration and mandatory disposable-PostgreSQL inheritance tests, upload/redaction/disposal audit regression tests without a real S3 destructive test; Round 46 registers another six authenticated owner/employee/client browser cases in manual protected workflow and extends normal CI source gates plus disposable demo PostgreSQL test of five client scopes, pending consent and missing grants; Round 47 adds fail-closed, exact-Bearer CRON_SECRET authentication before work in all 17 legacy Vercel cron GET routes, a machine-auth unit regression suite and a CI source-drift gate for scheduled cron endpoints; Round 48 fixes Clerk middleware machine ingress, requires explicit active tenant and signed Twilio callback paths, quarantines two replay-unsafe legacy Stripe webhook handlers, adds public/machine method CI source gates and unsigned HTTP denial probes; Round 49 adds explicit auth before delegated feed-follow mutations, local upload owner/size/tenant checks, nested URL ancestry, private chat isolation and an authenticated historical-method source drift gate | Full all-method historical sensitive-read audit is NOT complete; Round 43 adds source CI drift gate for authenticated GET, protected tRPC reads and search POST, not same-transaction SELECT coverage; **actual** protected Clerk/Neon signed-in browser and accessibility run; separate two-tenant staging, vendor tests, independent pen/load review, WORM/PITR and witnessed recovery, vault/pager approval and authorized rollout | **01,02,04,05,15,16,17,18** | **PARTIAL CODE — NO STAGING/PRODUCTION RELEASE AUTHORIZATION** |

### Round 53 — distributed booking, analytics authority and cancellation (M1/M4/M8)

Bookings (submit, cancel, slot GET) and analytics (Forms 2.0 track,
published-site track) use tenant PostgreSQL atomic per-minute quotas
and private visitor HMAC hashes across independent application clients.
Policies: booking submission 60/tenant, 20/page, 5/visitor, 2/unknown;
cancellation 90/tenant, 30/page, 10/visitor, 3/unknown;
slots 600/tenant, 200/page, 30/visitor, 5/unknown;
analytics 1000/tenant, 180/form/site, 40/visitor, 8/unknown.
Only booking *creation* requires a new Turnstile token verified against
the exact booking page/tenant action and allowlisted hostname.
All paths require active registered tenant/canonical schema, explicit
approved ingress IP header and protected configuration; 429 with
Retry-After 60. Missing credentials/storage deny rather than bypass.

Following incomplete authorization item: remove unsafe anonymous
SITE_FORM_SUBMIT workflow dispatch from site analytics; demand a
PUBLISHED site and site-owned PUBLISHED page for recorded events.
Only publish-ready F2 forms and owned steps can receive client-side
navigation telemetry. Browser events cannot claim payment/submission
success, and hosted F2 VIEW uses the metered endpoint. Public reschedule management now checks active
tenant registry and constant-time bearer tokens, demands a new booking
challenge, and never claims success when old-cancel fails or a network
outcome is unknown. Atomic multi-reservation rescheduling is still OPEN.
Cancellation
now checks bearer management token and updates booking/event status
in a serializable transaction; notification is post-commit. New CI
source, route, unit and independent PostgreSQL-client contention tests.
[Round 53 report](CHESS_CORP_2_ROUND53_PUBLIC_SURFACE_SECURITY.md).

No hosted Cloudflare or two-tenant protected staging evidence exists.
Remaining public/machine endpoints, mutation grants, external immutable
audit custody, data privacy and regulated independent approvals are
not certified. 8/8 production milestones BLOCKED; 0/8 signed off.

### Round 52 — distributed public form anti-abuse and bot verification (M1/M8)

Both public form POST submission endpoints now require active registered tenant
and correct schema, 32 KiB body limit, quota admission using existing tenant
PostgreSQL `ChessRequestRateWindow`, and Cloudflare Turnstile Siteverify
before creating a Lead or Forms 2.0 submission. HMAC digests obscure the
trusted-IP identities. Per-minute shared limits: 120/tenant, 40/form,
8/visitor or 3/unknown visitor. Only configured, ingress-overwritten
`x-vercel-forwarded-for` or `cf-connecting-ip` can be trusted; forged/
malformed headers enter the strict unknown bucket. A missing key, misconfigured
host/action, exhausted quota, database outage or unverified challenge fails
closed. Public UI now renders site-key-only challenges, with one-time token
reset on failed POST. Source and unit tests plus dual-independent-client
disposable PostgreSQL contention run in normal CI.

Activation requires Cloudflare widget/secret, exact allowed widget hostnames,
a 32+-byte server HMAC key, confirmed trusted proxy ingress and a protected
fictional multi-tenant sandbox review. No keys are committed. Public booking
and other anonymous POST/trackers remain outside this particular change.
See [Round 52 report](CHESS_CORP_2_ROUND52_PUBLIC_FORM_ABUSE.md).
8/8 production milestones remain BLOCKED; 0/8 signed off.

### Round 51 — public booking tenant and concurrency hardening (M1/M8)

Public booking GET slots, POST submit and POST cancel now check ACTIVE
platform registry status and exact tenant schema before accessing tenant
data. Slot date validation rejects overflow dates. Booking creation moves
page/slot SELECT, ownership-bound calendar choice, contact, event, attendee
and booking INSERT into one SERIALIZABLE tenant transaction; only a committed
booking can trigger post-commit notifications and automations. A same-slot
concurrent reservation must not produce two bookings. CI adds pure regression,
source drift and disposable PostgreSQL contention tests. See
[Round 51 report](CHESS_CORP_2_ROUND51_PUBLIC_BOOKING.md).

This covers three public booking paths, not all public capabilities or machine
callbacks. Distributed rate limits, timezone/DST correctness, consent/privacy
policy, outbox delivery idempotency and real protected multi-tenant staging
remain incomplete. 8/8 production gates BLOCKED, 0/8 signed off.

### Round 50 — tenant and legacy-accounting transaction-coupled sensitive-read auditing (M1/M8)

**Authenticated historical GET inventory:** 42 method endpoints in
111 `READ_PATH_REVIEW_REQUIRED` route files. Current source assigns
39 ordinary tenant-schema GETs to the `withAuditedHistoricalGet`
wrapper, two CHESS profile reads to their existing *source-level*
`auditedChessSensitiveRead`/`auditedClientServiceRead` transactions,
and the remaining tRPC GET to its separately protected legacy
accounting transaction middleware. The authenticated read-only search
POST uses the same tenant-schema transaction-bound wrapper.

- **Tenant-schema transaction:** the middleware/header-resolved tenant
  database client is redirected to an isolated `AsyncLocalStorage`
  request-local `Prisma.TransactionClient` during GET execution.
  Both `getTenantDb` and direct `getTenantPrisma` refuse
  a tenant/schema swap or an escaped/closed transaction.
  The `Serializable` transaction rechecks an ACTIVE membership,
  invokes the handler's source SELECT and writes
  `HISTORICAL_AUTHENTICATED_GET_ATOMIC` to
  `ChessSecurityEvent` before releasing the response.
  An event, SELECT or commit failure returns generic 503 without the
  constructed response; a suspended/removed member is denied. Scope
  validation rejects successful handler responses without any tracked
  tenant database access. Errors are no-store.
- **Already source-audited profile services:** two specific profile GET
  routes use an explicit `withAlreadyAuditedHistoricalGet` marker,
  rejecting use of that exception in any other route. The underlying
  sensitive record, live role and explicit client-service grant
  checks remain in their existing audited serializable transactions;
  these are not blanket exemptions for CRM data.
- **Legacy-ledger protected tRPC queries:** independent
  `src/server/trpc-read-scope.ts` and `src/server/trpc-db.ts`
  intercept all seven tRPC router database selectors (and nested bank
  reconciliation query helpers). A protected query now rechecks the
  active user, tenant and membership in one legacy Prisma transaction,
  passes the *live* identity context to the resolver, executes
  SELECTs through that transaction, then commits a privacy-limited
  `AuditLog` event before returning bytes. Any failed audit/commit
  fails closed; the query-scoped client rejects mutations and nested
  transactions. Public tenant branding reads remain outside the
  authenticated policy by design. Ordinary tRPC **mutations are not**
  given read-only privileges or included in this certification.
- **Tests:** scoped request-concurrency/mismatch tests; mocked source
  read/permission/event/commit failures and read-only tRPC proxy
  enforcement; a disposable PostgreSQL tenant-schema integration test
  verifies a real SELECT and audit INSERT committed together, revoked
  denial evidence and rollback on failed event insertion. Round 43
  source audit gate is updated; a new Round 50 CI gate enumerates all
  42 GETs and validates the 39+2+1 audited boundary plus search POST.
  Independent three-job latest SHA CI is still necessary.

**Limitations:** static coverage and controlled CI are not proof of
every helper's dynamic SQL path in every workflow. No real Clerk
browser sign-in, two-tenant or per-business and per-service
authorization/race acceptance, immutable WORM receipt, external audit
custody, public-token/machine callback review, live mortgage/health
record authorization, third-party attestation or provider approval is
performed. More code work remains on mutation authorization,
independent DB access through helper code, public/machine routes,
document consent and replay/recovery.

Protected owner-supplied inputs are unchanged except for requiring
formal acceptance evidence: isolated Clerk TEST identities,
Neon/staging tenant schemas, independent audit custody and reviewer
signoff; see [single owner checklist](CHESS_CORP_2_OWNER_SUPPLY_CHECKLIST.md).
No new secret was generated or committed. **8/8 production milestones
remain blocked; 0/8 independently signed off.**

See [Round 50 engineering report](CHESS_CORP_2_ROUND50_TRANSACTIONAL_SENSITIVE_READS.md).

### Round 49 — authenticated historical non-GET API review and focused remediation (M1/M8)

**Scope:** Source-of-truth Round 37 inventory with 111
`READ_PATH_REVIEW_REQUIRED` route files (the live CI script determines
their POST/PUT/PATCH/DELETE methods, not a stale manually reported count).
The independent KOBIA platform is still not a single licensed legal firm.
The branch and draft PR #24 remain unmerged.

- **Tenant-module selection:** `/api/active-module` now checks
  same-origin JSON mutation, authenticated Clerk identity, ACTIVE
  platform tenant with correct schema, and ACTIVE membership in the
  selected tenant before writing a preference cookie. Invalid/foreign
  selectors receive 400/403; errors are fail-closed. Cookie is
  `secure` in production.
- **LOCAL file upload:** the previously unguarded PUT requires
  `record:create`, ACTIVE member, same-origin request, exact
  `tenants/<tenant>/` prefix, matching uploadedByClerkUserId,
  UPLOADING/LOCAL status, **exact positive declared size**, and a
  streaming 25 MiB upper bound. Local /tmp sink is explicitly
  unavailable in production. The upload preparation endpoint rejects
  missing/oversized/noninteger file sizes.
- **Nested resources:** forms/fields/steps CRUD and reorders now check
  the exact parent-form ID, including a field's optional step; workflow
  run cancellation validates the parent workflow. Site-page reads,
  updates and deletes require the URL's site ID; block creation,
  reorder, modification and deletion verify both site page and
  per-block ancestry. Site-domain deletion checks domain.siteId.
  Foreign, duplicate or mismatched nested IDs fail 404 before effects.
- **Private chat:** GET/POST messages and mark-read now require channel
  membership for PRIVATE, DM and GROUP_DM; PUBLIC remains visible to
  ACTIVE tenant users. Only public channels permit implicit join.
  Replies must belong to the requested channel. Direct-message targets
  must be ACTIVE tenant members; reactions, pins, edits and deletes
  also verify channel access. This fixes guessed-private-channel-ID
  response exposure within an otherwise authorized tenant.
- **Delegated feed-follow:** both POST and DELETE explicitly check
  `record:create` before entering their shared handler.
- **CI and tests:** new pure/mock authorization tests cover tenant
  selection, cross-uploader/oversize local PUT, cross-parent forms,
  site blocks/domains, workflow runs, private/DM channel access,
  cross-channel replies, and active-member DM targets. New CI
  `scripts/chess-round49-authenticated-mutation-gate.mjs` inventories
  all 111 historical authenticated-read routes and **every** declared
  non-GET method in the category, requiring permission-before-DB
  access or an explicitly documented delegated/public/machine
  admission path. It also rejects removal of Round 49 URL-ancestry
  and private-chat guards. It is a source drift check, **not**
  executed real multi-user browser acceptance.

**Still incomplete as engineering code:** many historic mutations
still use coarse tenant-wide RBAC, not per-CHESS-business employee
assignment or client-service grant. Checks before an independent
Prisma mutation are not necessarily serializable with that mutation;
post-read Round 43 audits still cannot certify same-transaction
SELECT authorization. Distributed CSRF/origin policy for all legacy
JSON routes, public capabilities, row-level data-sharing,
audit-attempt/deny coupling, owner-scoped mail attachments and
two-tenant race tests require additional method-by-method work.
Actual protected Clerk/Neon E2E, recovery, vendor and external
signoff also remain outstanding. No new external credentials or
production feature switches were introduced.

See [Round 49 method review](CHESS_CORP_2_ROUND49_AUTHENTICATED_MUTATIONS.md)
and [owner checklist](CHESS_CORP_2_OWNER_SUPPLY_CHECKLIST.md).
Final code/doc commit requires 3/3 normal GitHub Actions jobs on
that **exact SHA**; no CI run authorizes a deployment. **8/8
production milestones remain BLOCKED; 0/8 signed off.**

### Round 48 — historical public and machine API remediation (M1/M8)

Round 48 addresses *specific* uncovered historical API risks in the
162-file Round 37 inventory, including both M1 sensitive-data routing
and M8 machine/public invocation. It **does not** certify the full
historical surface. New code and unit/source/black-box checks:

- **Public Forms 2.0 payments:** `/api/f2/[slug]/payment-intent`
  no longer calls `markSubmissionPaid` without a provider receipt.
  It returns HTTP 503/paid:false without DB writes even when the caller
  submits a fake ID or a Stripe key is absent. The historical stub could
  previously return `paid:true` without collecting money; real
  payment initiation remains unavailable.
- **Inbound relay mail:** HMAC-style timing-safe digest comparison of
  a distinct strong `EMAIL_INBOUND_SECRET`, strict
  `kobia+<slug>@<EMAIL_INBOUND_DOMAIN>` recipient parsing (default
  host `inbound.kobia.ai`), active platform registry and exact ACTIVE
  per-tenant mailbox before any writes. No `acme` fallback. Requires
  a protected relay callback configuration and separate provider retry
  and idempotency acceptance.
- **Five Twilio callbacks:** signature check plus mandatory explicit
  `tenant` query selector and active registry/schema validation
  before tenant DB access. Sender functions now construct tenant-bound
  callback URLs for number purchase, SMS status, voice status/recording
  and TwiML voicemail. Existing provider URLs lacking the signed
  selector must be migrated in protected staging.
- **Public booking cancellation:** unguessable 18-byte token is verified
  using constant-time digest comparison and canceled with a conditional
  update so concurrent replays do not both trigger side effects.
- **Open/click tracking:** HMAC-signed, expiring, purpose/recipient/
  tenant-bound capabilities replace arbitrary `?t=&url=` redirects
  and unsigned delivery-status writes. Without a signing key, email
  pixel generation omits the image, clicks return 404 and unsigned
  pixel requests remain inert. Click-link issuance is **not** wired
  across every historical campaign generator.
- **Stripe legacy callbacks:** the tenant billing and accounting
  signup handlers now return 503 without side effects, rather than
  accepting replay-prone/out-of-order provider events without atomic
  unique receipts. A replacement with idempotent event inbox, trusted
  customer/price binding, payment evidence and certified replays is
  still **code work**, not a vendor-only checkbox.
- **Method inventory and HTTP probes:** a CI gate validates the
  162-file classification and exact reviewed machine/public method
  controls while reporting that other authenticated mutation paths
  need path-by-path atomic authorization/response audit. Black-box
  HTTP smoke validates default-deny ingress for cron, inbound email,
  fake payments, unsigned tracking, Stripe and Twilio.

Neither bounded Round 43 response-release auditing nor Round 48 source
guards prove that all historical SELECTs run in an audited transaction,
that legacy mutation response bodies are fully scoped or that every
public capability and webhook is independently certified. Public form
spam controls are still process-local and require distributed abuse
protection. Financial/regulated flags remain OFF. **8/8 production
milestones remain blocked; 0/8 signed off**. A successful normal CI run
does not represent live provider or signed-in protected staging.

See [Round 48 detailed audit](CHESS_CORP_2_ROUND48_HISTORICAL_API_SECURITY.md),
[owner inputs](CHESS_CORP_2_OWNER_SUPPLY_CHECKLIST.md) and
[default-off config](CHESS_CORP_2_ENV_PLACEHOLDERS.example).

### Round 47 — KOBIA machine scheduler admission control (M8; M4-dependent)

All **17 Vercel-scheduled legacy KOBIA `/api/cron/*` GET handlers** were
previously callable without explicit machine authorization. Round 47 places
`requireKobiaCronAuth(request)` as the **first executable statement** of
each route, before enumerating tenant registries or running any work. It
requires an exact `Authorization: Bearer <CRON_SECRET>` match, using
constant-time fixed-length digest comparison; missing/weak configuration
returns 503, invalid/missing bearer returns 401, both with no-store.
The server-only `CRON_SECRET` must be 32+ bytes of fresh high-entropy
random material. It is **not committed** or automatically enabled here.

New `src/lib/security/cron-authorization-round47.test.ts` exercises
missing/weak secret, exact bearer, invalid schemes, mismatches and Clerk
cookie non-bypass. `scripts/chess-round47-cron-auth-gate.mjs` checks
all cron implementations against `vercel.json` and fails normal CI
if any GET lacks the immediate guard. This is a narrow machine-admission
control, **not** a complete machine-callback/legacy sensitive-read audit;
external webhooks, replay/idempotency, job-level tenant isolation,
authorized per-tenant effects, vendor acceptance and actual deployed
Vercel scheduler invocation remain unverified. Protected staging must
demonstrate unauthorized denial and authorized execution **before**
production release or scheduler activation.

See [Round 47 security report](CHESS_CORP_2_ROUND47_CRON_AUTH.md) and
[consolidated owner checklist](CHESS_CORP_2_OWNER_SUPPLY_CHECKLIST.md).
No merge/deploy, no live financial switches and no approval occurred.
M8 remains **PARTIAL CODE — BLOCKED**; 8/8 production milestones
blocked, 0/8 independently signed. Final code-and-doc commit requires
its own exact-SHA successful three-job CI verification.

### Round 46 — guarded employee/client fictional-demo E2E expansion

The interrupted Round 45 head was checked and its normal three-job
CI run **43306304711** completed successfully on exact SHA
`b6b41f590292c4b8335c092f82afe0cb666c1b29`. The earlier response
was interrupted, not the committed work.

Round 46 registers a separate **six-case actual Clerk TEST browser
scenario source** in `e2e/chess-demo-round46.spec.mjs` for the manual
protected `chess-demo-e2e` environment. It covers owner navigation
across the fictional eight-business service tour, employee two-tab
optimistic state conflicts and 409 recovery, cross-business foreign
task POST/PATCH denials, client purpose-consent and private document
isolation, work-item and appointment calendar preference opt-in/out,
and mobile serious/critical axe checks for separate employee/client
contexts. Existing Round 40 browser suites still run in the configured
Chromium project.

**Normal CI does not run real authenticated browsers.** It now
syntax-checks the new spec and asserts protected discovery, Clerk
sign-in source, safe nonterminal races, no live provider activation,
and no fabricated browser authentication. The disposable
`chess_demo_ci` PostgreSQL fixture integration further verifies all
five client profile scopes, distinct fictional business links,
zero service grants/private documents/cases and rejects a forged
PENDING-to-GRANTED update without proof. Only the manual protected
workflow, with distinct verified Clerk TEST identities, isolated
Neon `chess_demo` and an independent reviewer, can certify signed-in
browser and real accessibility acceptance. That protected run
remains **unverified**.

[Round 46 exact scenarios and owner prerequisites](CHESS_CORP_2_ROUND46_EMPLOYEE_CLIENT_BROWSER_E2E.md)
document the difference. There are no new externally controlled
keys or automatic release switches. M4/M8 stay **PARTIAL**,
all **8/8** production milestones remain **BLOCKED**, **0/8**
independently signed; this is not all-code-roadmap completion.

### Round 45 — document retention, versions, independent redaction and disposal audit

M3 now includes a new PostgreSQL lineage policy migration that propagates
immutable retention horizons, legal holds and suppression to replacement
and redacted versions, **including protections set after child creation**.
The existing one-predecessor-per-child, metadata immutability and
no-DELETE triggers remain enforced. Disposable tenant Postgres
integration tests now cover revision inheritance, cascading legal holds,
suppression and retention conflict refusal.

The source-only upload confirmation rechecks consent, live role and
write grant inside an audited SERIALIZABLE transition, requires strict
S3 HEAD plus an exhaustive one-version inventory, records QUARANTINED or
REJECTED with an event, and leaves PENDING on transient provider failures.
Single-use malware-scan decisions refuse extra object versions and audit
metadata denials; review of a CLEAN scanned REDACTED derivative now
fetches and SHA-256 verifies the actual pinned bytes, then records an
independent post-scan review-read event. Publishing demands explicit
independent attestation, that event and an atomic predecessor
supersession. The employee document panel now offers read-only
third-person S3 UNKNOWN disposal review using the existing PATCH route;
it never silently re-DELETEs the pinned version. Private relative
download URLs are resolved on the current origin.

[Round 45 detailed lifecycle engineering audit](CHESS_CORP_2_ROUND45_DOCUMENT_LIFECYCLE_AUDIT.md)
separates executable code/tests from **not yet approved or performed**
physical erasure, Object Lock/WORM, full backup/replica accounting,
independent human redaction inspection and legal retention rules.
M3/M8 remain PARTIAL; no storage credentials or release flags were
enabled. **8/8 production milestones BLOCKED, 0/8 signed.**
The final Round 45 commit requires an independent exact-SHA 3/3
normal CI result before calling this round verified.

### Round 44 — distributed financial fault testing, 14 isolated scenarios

Added **eight** further integration cases to the existing Round 38
two-disposable-PostgreSQL-bank-reconciliation suite, which normal CI
**actually executes** in `chess-db-integration`. Total cases: **14**.
The new tests simulate lost tenant reservation acknowledgments, two
concurrent ledger executions, changed source identity/idempotency key,
failure after claiming a bank transaction due to an invalid GL offset
or inactive bank account, a reconciliation read timeout, simultaneous
tenant receipt writes and an alternate source replay after posting.
They assert single source journal, two balanced ledger lines, atomic
bank-row/account-balance rollback, immutable receipt identity and
UNKNOWN state refusing automatic replay or premature consent withdrawal.
[Round 44 detailed fault matrix](CHESS_CORP_2_ROUND44_FINANCIAL_FAULT_MATRIX.md)
describes each outcome and what remains unverified.

**This is code/test coverage, not deployment acceptance.** The two test
databases share **one temporary PostgreSQL test service**, and failures
are deterministic simulations around actual database transactions; no
independent financial provider, network partition, bank funding or
actual ACH/wage/tax settlement is exercised. Round 41 independent
four-person resolution remains default-OFF. Existing owner-supply
groups 07/14/16/17/18 still require protected cross-cluster fault
acceptance, reconcilers and accountant/security signoff. No new
external credential is needed for these CI fixtures. M5 and M8
remain PARTIAL and every production release gate stays blocked.

**Round 44 final-commit CI verification is a separate required step**
and must match the draft PR head, not just an intermediate test commit.

### Round 43 — historical sensitive read coverage: release audit vs. atomic SELECT

Round 43 hardens **41 historical authenticated GET route files** via a
fail-closed, privacy-minimal audit **before successful response release**.
The original legacy data query is NOT guaranteed to be in the same database
transaction as the new security event. The protected tRPC procedure query
middleware audits successful private queries after a fresh legacy membership
recheck; `/api/trpc` no longer defaults the tenant to `demo`. The
read-only `POST /api/search` also requires a successful response audit.

A normal CI source gate now fails on **new unwrapped authenticated GET
methods** in the 162-route Round 37 inventory and checks the tRPC/search
read markers. Separate public tokens (9 routes), machine callbacks (26),
mutation-only routes and other POST/PUT/PATCH/DELETE response paths remain
subject to detailed method-by-method validation and auditing. Source wrappers
are not proof of transaction-coupled SELECTs, row/consent scope, fully
reviewed historical route coverage or immutable external audit. See
[Round 43 bounded audit report](CHESS_CORP_2_ROUND43_HISTORICAL_SENSITIVE_READ_AUDIT.md).
**M1/M8 remain partial code; release 8/8 blocked, 0/8 signed.**
No live credential or new provider contract was required to implement
these source changes.

### Round 42 evidence and remaining engineering crosswalk

**Verified developer baseline:** Round 41 final source commit
`b6054ee3915f735f3b40140cf2a1e6bfac00b88d`, GitHub Actions
[43291060523](https://github.com/awesso007/kobia-platform/actions/runs/43291060523),
**build + CHESS tenant PostgreSQL + legacy ledger PostgreSQL: all 3 success**.
This is normal disposable-source CI only; no authenticated live Clerk
browser, external storage erasure, bank settlement, signing or production
acceptance was performed. The final Round 42 documentation commit must
receive **its own** exact-SHA green CI result before this round is closed.

| Milestone | Source verified through Round 41 | Open code-only / independently verified work | Approval or vendor dependency | Status |
| --- | --- | --- | --- | --- |
| M1 | Current-role employee task list audited within a SERIALIZABLE transaction, plus earlier selected legacy guards | Complete path-by-path historical sensitive-read review (Round 37 inventoried 162 legacy routes, 146 not part of selected guard sweep); prove cross-tenant revocation races | Identity/legal data-sharing and external immutable audit proof: 01,02,03,15,17,18 | Partial source; release blocked |
| M2 | Live business/staff authorization and revocation source | Protected two-tenant least-privilege and concurrent revocation verification; account for real organizations and licenses | Verified organization/employee records: 01,02,03,10,17,18 | Partial source; release blocked |
| M3 | Versioned documents, independently reviewed redaction, retention/hold metadata; three-person read-only UNKNOWN S3 resolution; exact pinned version and untruncated inventory checks; default-OFF worker | Storage-backed duplicate-version, hold/delete race, backup/restore and UNKNOWN case acceptance; prove provider immutable audit | Counsel-approved retention/legal hold, separate private S3/KMS/Object Lock/IAM, scanner, protected operators: 01,02,04,05,16,17,18 | Partial source; physical purge OFF |
| M4 | Employee task creation/update revalidate roles, unit, assignment and client scope in SERIALIZABLE audited writes; protected fictional demo browser suite registered | Actual signed-in demo/staging Playwright and accessibility runs, recurring-worker/pager alerting, delegated OAuth/cancel confirmation | Calendar gateway, protected identities and worker credentials: 01,02,03,06,15,17,18 | Partial source; release blocked |
| M5 | Three-person approval and durable attempts; six dual-disposable-Postgres failure tests; default-OFF fourth-person posted-journal-only reconciliation and no undocumented executor replay | Independent network/consent race simulation and witnessed cross-DB UNKNOWN/UNPOSTED/DIVERGED operating procedure; remaining close and exception code paths | Bank/payroll/tax services, accountant authorization, financial evidence: 01,07,08,09,14,16,17,18 | Partial source; posting/funding/e-file OFF |
| M6 | Licensing evidence and opaque regulated partner handoff scaffolding | Separate regulated provider acceptance, verified revocation and execution boundaries | Licensed supervisors and certified partners: 03,04,10,11,17,18 | Partial coordination; execution OFF |
| M7 | Human-approved AI metadata triage, draft-only billing and operational reports | Statutory/ledger close, disputed/refunded settlements and reporting evidence | Certified AI/merchant providers, accountant and legal review: 12,13,14,15,17,18 | Partial source; settlement/close OFF |
| M8 | Three green Round 41 CI jobs, source-policy tests, disposable Postgres, scripted staging/DR probes | Full historical security sweep, actual protected-browser/two-tenant/WCAG, penetration/load tests, independent WORM/PITR witnessed recovery | Protected staging, secrets/vault, independent security and release gate: 01,02,04,05,15,16,17,18 | Partial source; no release approval |

**Accounting remains 8/8 milestones production BLOCKED; 0/8 independently
signed.** A completed source CI job must never convert any owner checklist
item to approved. The canonical 18-group [owner-supply
checklist](CHESS_CORP_2_OWNER_SUPPLY_CHECKLIST.md) remains the only active
external-input list. Keep CHESS as a KOBIA tenant, PR #24 draft, `main`
unchanged, and default-OFF execution gates in place.

**Verified source checkpoints (normal GitHub Actions, not production or
actual authenticated browser acceptance):**

| Engineering round | Verified exact source commit | Completed normal CI (3/3 green) |
| --- | --- | --- |
| Round 31 | `96902a15561f0d0d9e8612c7a8d29a64bdb95974` | [43171848342](https://github.com/awesso007/kobia-platform/actions/runs/43171848342) |
| Round 32 | `ac9123aa09b5301d11f6f418c84e9361080c172d` | [43174744357](https://github.com/awesso007/kobia-platform/actions/runs/43174744357) |
| Round 33 | `1775d4bd54bf4f57c7567a385658e32a3b9ca607` | [43177693237](https://github.com/awesso007/kobia-platform/actions/runs/43177693237) |

**Round 34 documentation head passed all three normal CI jobs at**
`6d241a2a0efdad2cd3e0494d7f859cf1f79169c0`
([run 43179174988](https://github.com/awesso007/kobia-platform/actions/runs/43179174988)).
**Round 35 baseline passed all three jobs at**
`d0b0677b25d862959c4a490340bf3cd904d63200`
([run 43184184877](https://github.com/awesso007/kobia-platform/actions/runs/43184184877)).
**Round 36 final commit `3d113b05f15fc686ef1f3a5d91aaf66e33e60cb1` passed 3/3 jobs** ([run 43270152248](https://github.com/awesso007/kobia-platform/actions/runs/43270152248)). **Round 37 final `a02d778abd501c104a4845339cb1f142494222d0` passed 3/3 jobs** ([run 43277957939](https://github.com/awesso007/kobia-platform/actions/runs/43277957939)). **Round 38 final commit `f7ea573b45800b508de42fb073c2688a47807193` passed 3/3 normal CI jobs** ([run 43280276731](https://github.com/awesso007/kobia-platform/actions/runs/43280276731)). **Round 40 final commit `8749b59f43fef931cda34ed340fb2b33ba9706e1` passed 3/3 normal CI jobs** ([run 43286579398](https://github.com/awesso007/kobia-platform/actions/runs/43286579398)). **Round 41 final commit `b6054ee3915f735f3b40140cf2a1e6bfac00b88d` passed 3/3 normal CI jobs** ([run 43291060523](https://github.com/awesso007/kobia-platform/actions/runs/43291060523)). **Round 42 final commit `35d3d88dd64c50a73024feedd3cde6fa39dcd935` passed 3/3 normal CI** ([run 43292695459](https://github.com/awesso007/kobia-platform/actions/runs/43292695459)). **Round 43 final commit `ab7d1f51c6c3b7d379c1207ea1348582632aa0dc` passed all 3 normal CI jobs** ([run 43297225931](https://github.com/awesso007/kobia-platform/actions/runs/43297225931)). **Round 44 final commit `4e29c22e07fc4d951b39546640a680f29add9455` passed all 3 normal CI jobs** ([run 43300160700](https://github.com/awesso007/kobia-platform/actions/runs/43300160700)). **Round 45 final commit `b6b41f590292c4b8335c092f82afe0cb666c1b29` passed all 3 normal CI jobs** ([run 43306304711](https://github.com/awesso007/kobia-platform/actions/runs/43306304711)). **Round 46 must separately pass all three normal CI jobs on its exact final SHA; normal CI checks Playwright syntax and guarded source evidence, NOT signed-in Clerk browser execution or protected external acceptance.** The test matrix is source/CI evidence only:
`build` (lint, typecheck, unit tests, Next build, security smoke),
`chess-db-integration` (disposable tenant PostgreSQL), and
`chess-legacy-ledger-integration` (disposable legacy PostgreSQL). The
manual protected `chess-demo-browser-e2e.yml` with actual Clerk accounts
**has not been proven to run**, and passing syntax tests are not equivalent.
The 58-route manifest is an inventory, **not** an audited-authorization
certificate. Round 32 TODO search reported incomplete results, so neither
all TODOs nor all code-only roadmap items are certified finished.

**Release accounting: 8/8 production milestones BLOCKED,
0/8 independently signed.** No new credential is needed to edit these
documents. The single canonical [owner-supply checklist](CHESS_CORP_2_OWNER_SUPPLY_CHECKLIST.md)
remains open for externally controlled credentials, legal terms,
independent reviews and staging evidence. CHESS remains a KOBIA tenant;
keep draft PR #24 unmerged and production `main` unchanged.

---

## CURRENT ROUND 41 — code-only ambiguity controls and remaining M1–M8 engineering

Added separate, **default-OFF**, independently authorized resolution of
ambiguous private document deletions and legacy ledger postings. Also
tightened M1/M4 employee task privacy: current membership, unit status,
assignments and title visibility are verified within the audited SERIALIZABLE
read, and creation/status transitions recheck live rights inside their
atomic write/audit. Document
UNKNOWN reconciliation checks the exact private tenant key, confirms
explicit S3 VersionId 404 and **zero remaining content versions** (untruncated
`ListObjectVersions`) before a third independent authorized reviewer can pin
an audit/tombstone. The purge worker now refuses demo mode, cross-tenant
keys, inactive approvers, legal holds and any extra S3 object version.
S3 permissions, WORM/replica erasure and legal proofs require external
approval.

For bank attempts, `POST /api/chess/bank-reconciliation` has two separate
OFF flags and needs a fourth independent owner/admin plus a source-bound,
balanced, already-posted legacy journal; UNPOSTED/DIVERGED and ledger UNKNOWN
are not auto-resolved or reposted. The original executor's replay endpoint
cannot manufacture a successful receipt from a GL journal without the
matching durable COMMITTED attempt. This is **ledger outcome evidence
only**, not actual bank settlement, payroll funding or financial close.

[Round 41 engineering and remaining gap audit](CHESS_CORP_2_ROUND41_CODE_GAP_AUDIT.md)
separates code-only additions and unverifiable protected staging/vendor
acceptance. **All-path historical read authorization, independent UNKNOWN
case procedures, external bank and S3 evidence, and some code-only
roadmap items remain incomplete.** The build-complete condition is
not met. Production releases remain **8/8 BLOCKED and 0/8 independently
signed**. PR #24 remains draft; no merge/deploy.

---

## CURRENT ROUND 40 — protected fictional employee/client end-to-end workflow tests

The existing manual `chess-demo-e2e` Playwright workflow now includes
`e2e/chess-demo-employee-client.spec.mjs` in addition to earlier
`chess-demo.spec.mjs`. Five additional browser cases cover employee foreign
business deep-link refusal without fallback, stale task PATCH 409 and
unchanged persisted status, SUPPORT-versus-manager rights, client task and
private-document denial, and three independent simultaneous OWNER/employee/
CLIENT sessions. Normal CI checks syntax/source policy; the isolated
`chess_demo_ci` database fixture test now checks task boundaries, zero
service grants, and pending-only fictional client consent. Protected Clerk
TEST/Neon browser execution is **not** established by normal CI, and must
be run and witnessed separately under owner-supply groups 17/18.

The interrupted Round 39 document lifecycle commit had a failed build job
because case-page revision timestamp values needed serialization; Round 40
fixes those pages and restores the prior UI safety warning. Round 39 source
now supports immutable replacement versions, scan-then-independent-review
redacted derivatives and default-OFF two-person exact-version disposal with
UNKNOWN handling; physical deletion and legal hold release remain
**externally prohibited** absent approved policy, vault credentials,
S3/KMS/WORM, purge/restore witness and independent signoff. See
[Round 40 test matrix](CHESS_CORP_2_ROUND40_DEMO_EMPLOYEE_CLIENT_E2E.md)
and [one owner checklist](CHESS_CORP_2_OWNER_SUPPLY_CHECKLIST.md).

**8/8 milestones remain production-blocked, 0/8 independently signed.
PR #24 remains draft and unmerged.**

---

## CURRENT ROUND 38 — two-database financial outcome fault testing

Added six opt-in real-PostgreSQL fault tests with **two separate disposable
database names** on an isolated CI PostgreSQL service. The tenant-side
reservation/consent state and legacy ledger classification/reconciliation
are exercised together under lost-ack timeout, before-commit timeout,
closed-period rollback, lost tenant receipt, simultaneous duplicate request,
and consent-withdrawal scenarios. Green source tests must demonstrate
one-or-zero journal commits as appropriate, immutable committed receipts,
no unauthorized retry from UNKNOWN, and no false bank settlement.

The CI suite is `src/lib/chess/distributed-financial-outcome-round38.integration.test.ts`.
It runs in the `chess-db-integration` job with
`RUN_CHESS_DISTRIBUTED_DB_INTEGRATION=1` and a **disposable, test-only**
`CHESS_FAULT_LEGACY_DATABASE_URL`. See
[Round 38 fault matrix](CHESS_CORP_2_ROUND38_FINANCIAL_FAULT_AUDIT.md).
No new external provider credentials or production feature flags.
This is **synthetic fault injection**, not two independent physical
clusters, actual bank settlement, or independent reconciliation/approval.
Protected staging, full UNKNOWN resolution and actual provider validation
remain open. 8/8 milestones still release-blocked, 0/8 signed.

---

## CURRENT ROUND 37 — historical route sensitive-read audit (partial)

Round 37 hardened historical KOBIA general-ledger/trial-balance exports,
mail-account and selected message/thread/draft reads, document downloads,
file-share/local capability reads, selected form submissions and workflow
run detail. A 60-second server-only HMAC bearer protects LOCAL downloads.
The unsafe legacy helpdesk "email address alone creates a session" workflow
is disabled, including existing legacy cookies and direct read endpoints,
until verified client identity is implemented. Role/race and privacy-minimal
audit negative tests accompany these source changes.

[Round 37 findings and limits](CHESS_CORP_2_ROUND37_HISTORICAL_READ_AUDIT.md)
link to a **162-route historical API manifest** with CI drift checking.
Only **13 route files** have the selected source guard markers and
**3 legacy helpdesk routes** are fail-closed in this round. The other
paths are classified as needing review or intentionally external/public
context; **the inventory is not evidence that all sensitive reads are
audited**. Server pages, tRPC and server actions require further audit.
All source and protected staging/external gates remain open where not
explicitly proven. **No service/provider activation, merger or deployment.
8/8 production milestones blocked; 0/8 independently signed.**

---

## CURRENT ROUND 36 — legacy 1099 taxpayer export access control

The historical KOBIA `/api/reports/1099-nec.csv` and
`/api/reports/1099-misc.csv` endpoints previously accepted any active
legacy tenant member, including CLIENT and VIEWER, for CSV downloads
containing vendor tax identifiers and contact details. Both now recheck
the live tenant, entity and membership within a SERIALIZABLE legacy
PostgreSQL transaction; only current OWNER, ADMIN or ACCOUNTANT roles may
read those vendor details. A privacy-minimal legacy AuditLog ALLOW/DENY
entry must commit before CSV release. Invalid years fail validation;
responses are no-store and nosniff. New negative tests cover stale roles,
suspended membership, foreign/deleted entity, audit failure and tax-year
validation. The legacy AuditLog is **not** WORM proof, and the other
legacy ledger CSV routes and historical APIs still require a full read
inventory. See [Round 36 code audit](CHESS_CORP_2_ROUND36_LEGACY_TAX_EXPORT_AUDIT.md).
**8/8 milestones remain release blocked, 0/8 independently signed.**

---

## CURRENT ROUND 35 — security and code-only engineering hardening

Round 35 closes **selected** source-only gaps across M1/M2/M6/M7/M8:
atomic role-checked provisioning of businesses, employees, clients,
client-service links and grants; audited business/employee/AI/approval
directories; and transaction-coupled regulated case filtering with
minimal browser fields. AI, monthly-report and operations intelligence
navigation now refuses explicit revoked/unassigned businesses. New
negative unit tests exercise role downgrade, consent/grant withdrawal,
privacy-minimal audit output, source-audit failure and invalid business
navigation. **None** of these source changes activates real financial
or licensed vendor execution.

See [Round 35 engineering audit](CHESS_CORP_2_ROUND35_ENGINEERING_AUDIT.md).
This round does **not** exhaust every sensitive KOBIA historical route,
prove all cross-database races, implement statutory close or legally
accepted e-sign/hold release, or run authenticated Clerk, vendor,
accessibility, WORM or DR production acceptance. **8/8 milestones
remain production blocked; 0/8 signed.** Draft PR #24 remains unmerged.

---

## CURRENT ROUND 33 — fictional demo usability and manager/staff navigation

Reviewed /app/overview, /app/chess-desk, work items, finance, action approvals,
business administration, bank posting monitor, billing and regulated intake.
Found manager-to-support mixed assignments could send people to another
business and several pages silently substituted the first business after
a revoked deep link. Some failed sensitive reads appeared as zero tasks or
calendar-sharing OFF. Added current-manager business selection, strict
explicit link handling, role-appropriate manager navigation, user-facing
fail-closed load errors and helpful empty states; added business-keyed
client component resets and a named recurring staff chooser.

See [Round 33 demo usability review](CHESS_CORP_2_ROUND33_DEMO_USABILITY.md)
and new Round 33 unit/source regressions. Normal CI is code proof only;
the protected Clerk/Neon browser run from checklist item 01, mobile/keyboard/
screen-reader review, legal approvals and actual sandbox evidence remain
unperformed. **8/8 production milestones remain blocked and 0/8 approved.**
Draft PR #24 remains unmerged; no main-branch or production deployment.

---

## CURRENT ROUND 32 — signed-in consent and worker health read audits

The Round 31 final SHA was green (3/3 jobs) at the start of this round.
GitHub's branch TODO search returned **incomplete** results; no claim is
made that every TODO in KOBIA is closed.

This round closes two documented M1/M3/M8 **code-only sensitive-read**
gaps: authenticated client-consent directory and disclosure details now
perform verified-email ownership checks and commit an opaque ALLOW/DENY
event inside the SAME serializable tenant transaction as all SELECTs.
The directory no longer loads full policy text. Tenant-wide worker,
calendar and archive health now similarly rechecks current OWNER/ADMIN
membership and audits the read before releasing metrics. New negative tests
cover foreign Clerk grants, stale contact ownership, unverified identity,
revoked roles, audit outages and privacy-minimal event content.

See [Round 32 security read audit](CHESS_CORP_2_ROUND32_SECURITY_READ_AUDIT.md)
for changed paths, tests and unverified work. This does NOT establish
full historical/legacy-path audit coverage, live finance execution,
signed-in Clerk staging verification, third-party security approval,
WORM evidence or DR. Existing owner checklist 01/02/04/05/07/16/17/18
still applies. **All 8/8 production milestones remain blocked; 0/8
independent release approvals.** Never merge PR #24 or deploy `main`
as a result of a normal CI pass.

---

## CURRENT ROUND 31 — manager exception monitor and recurrence inspection UI

Reviewed existing employee/admin screens against the CHESS API inventory. The
newly introduced M5 bank posting attempt states lacked a dedicated operational
exception screen; the M4 fairness scheduler did not display persisted worker
inspection timestamps. Added **/app/financial-attempts**, an audited
business-manager-only read-only status dashboard with no client details, posting
or UNKNOWN retry controls, and added last-inspected/never-inspected text to
the manager's recurrence list. Current MEMBER/MANAGER assignments now expose
only limited finance and monitor links in /app/chess-desk; ordinary SUPPORT
staff never receive these links or owner/admin controls.

See [Round 31 employee UI register](CHESS_CORP_2_ROUND31_EMPLOYEE_UI.md) for
paths and negative checks. This is a code-only UI increment. **All 8/8
production milestones remain blocked, 0/8 independently signed.**
The existing canonical owner checklist 06/07/16/17/18 still covers external
worker, bank, migration, staged auth and independent signoff requirements.
No real ledger posting, licensed activity or production deployment is approved.

---

## CURRENT ROUND 30 — signed-in browser acceptance source coverage

Added twelve Clerk test-mode Playwright cases for the first CHESS tenant:
OWNER overview, eight-company fictional tour and finance authorization; MEMBER
service desk, single Bookkeeping business, task-state persistence, read-only
calendar-consent controls and cross-business denials; CLIENT pending consent,
one verified-email fictional profile and no employee/admin access; plus
unauthenticated redirect and axe-core WCAG 2.1 A/AA serious/critical scans.
The test harness now refuses live/mismatched Clerk credentials, remote browser
targets, non-demo databases, duplicate identities or enabled external
services before opening a browser. A separate client-consent service gate
prevents direct API acceptance without the three approved portal flags, and
blocks all client consent mutations in fictional mode.

See [Round 30 signed-in browser acceptance](CHESS_CORP_2_ROUND30_BROWSER_ACCEPTANCE.md)
for the test matrix and exact evidence boundary. The ordinary three-job CI
can verify the code, but **does not prove real Clerk/browser/axe execution**
without the protected external inputs in the **single owner-supply checklist,
item 01**. No real provider, legal signature, stage/DR or independent
accessibility evidence was supplied. **8/8 production release milestones
remain blocked; 0/8 are independently approved.** PR #24 remains unmerged
and no production deployment is authorized.

---

## CURRENT ROUND 29 — source-only engineering and strict release separation

Round 29 adds a persistent M5 bank-attempt reservation/UNKNOWN journal,
serializes consent withdrawal with financial attempts, and binds admin
cancellation to the same business. M4 recurring-work fairness, exact backlog
lookahead and PostgreSQL regression now cover indefinitely blocked templates.
Privacy-minimal, transaction-coupled manager/employee audit coverage extends
to appointment and calendar directories, work queues, staff rosters, employee
alerts, tax workpapers, invoice listings and recurring templates. The isolated
fictional client preview, gated Clerk browser harness and consent-checked
document stream remain non-production acceptance work.

See [Round 29 engineering and acceptance register](CHESS_CORP_2_ROUND29_ENGINEERING_AUDIT.md)
for exact newly changed paths, code-only limitations and independent evidence.
**No release gate changed:** 8/8 milestones remain production-blocked and
0/8 independent release approvals are on file. Real vendor sandboxes, complete
sensitive-read inventory, security/accessibility signoff, staging/DR and
professional/licensed execution are not certified by ordinary CI. The
[canonical owner-supply checklist](CHESS_CORP_2_OWNER_SUPPLY_CHECKLIST.md)
remains the only external-input register (18 groups). PR #24 is still draft;
never merge or deploy `main` as part of this engineering round.

---

## CURRENT ROUND 27 — staff and supervisor screen coverage

Added /app/chess-desk as a role-limited employee entry point, linked
from KOBIA's overview. Revised the business-unit offboarding UI to
show atomic client-grant revocation counts, the recurring-billing UI
to show exact worker inspection timestamps, and private document UI
to explain verified consent/scan requirements. Added static UI
regressions for historical read-only bank journal reconciliation.
See [Round 27 employee UI audit](CHESS_CORP_2_ROUND27_EMPLOYEE_UI.md)
for the full M1–M8 route inventory and deliberately machine-only APIs.

**No release change:** all eight milestones remain subject to their
existing external/independent acceptance gates; separate Round 26
code-only engineering blockers remain. Never enable a financial or
regulated execution flow from a navigational link. PR #24 stays draft
and production is unchanged.

---

## CURRENT ROUND 26 — engineering verification scope (November 11, 2026)

**Latest development change inventory:** M1 role-scoped profile/provisioning
audit, M2 atomic assignment+service-grant revocation, M3 consent-checked
document access, M5 read-only bank-to-GL reconciliation/API/UI, M7
fairness-paged draft billing with its additive PostgreSQL migration, and
M8 additional audited sensitive SELECT paths. Round 26 also preserves
the existing M4 work/calendar and M6 regulated coordination controls
without enabling uncontracted providers.

**Status:** **8/8 milestones still incomplete for production, 0/8 signed
release approvals**. The Round 24 milestone-by-milestone table below
remains the baseline release gate matrix. New code changes do **not**
make the remaining cross-database race, all-sensitive-read auditing,
full e-signature/retention, licensed-provider execution, statutory
consolidation, actual browser E2E, DR/incident paging or real staging
pass automatically.

For exact new code, tests, unresolved code-only work and the M7 migration,
see [Round 26 engineering audit](CHESS_CORP_2_ROUND26_ENGINEERING_AUDIT.md).
For **one** list of secrets, contracts, provider keys and independent
approvals, continue to use the
[owner-supply checklist](CHESS_CORP_2_OWNER_SUPPLY_CHECKLIST.md).
No new real credential is introduced by the read-only ledger
reconciler. Never merge or deploy draft PR #24 without a separately
authorized release.

---

## HISTORICAL BASELINE — Round 24 milestone status, November 11, 2026

**Historical Round 23 baseline only — superseded by the authoritative Round 34 matrix above.**

**Source of truth for M1–M8 through Round 23 code:** draft
[PR #24](https://github.com/awesso007/kobia-platform/pull/24),
branch `feature/operations-overview` at verified source SHA
`5b653a9fd92b8fe0cebb0272862eadc881f8cde9` ([CI
43136509383](https://github.com/awesso007/kobia-platform/actions/runs/43136509383)).
All **three** jobs completed/succeeded: `build` (lint, typecheck, unit
tests, Next.js build, security smoke), `chess-db-integration` (real
disposable tenant PostgreSQL migration/integration, isolated demo seed) and
`chess-legacy-ledger-integration` (real disposable legacy PostgreSQL
posting, concurrency, replay and closed-period rollback). This is **code
verification**, not evidence of deployed services, actual provider contracts,
legally binding e-signatures, licensed capacity, real money settlement,
privacy acceptance or production authorization. Round 24 is a
documentation/consolidation update; confirm CI separately at its own head SHA.

**Overall: 8/8 milestones have partial development implementation;
0/8 have passed every required production release gate. The entire
CHESS CORP 2 BUILD remains INCOMPLETE / NOT APPROVED FOR PRODUCTION.**
This status explicitly supersedes the Round 14 table and all dated,
historical "not implemented" statements further down this file.

**ONE canonical owner-supplied list:** [Round 24 external inputs,
credentials and approvals](CHESS_CORP_2_OWNER_SUPPLY_CHECKLIST.md).
Do not treat prior round-by-round inputs as additional lists; those are
implementation history only. Never share actual keys in chat, GitHub
PRs/issues or source control. Inject secrets through a protected vault
or approved GitHub environment after the responsible reviewer signs off.

| Milestone | Verified development implementation (on Round 23 SHA) | What is still not complete / independently verified | Source item IDs | Production release |
| --- | --- | --- | --- | --- |
| **M1 · Shared profile and permissions** | Tenant-local CHESS profiles, service links, direct staff grants/revocation, protected employee screens; append-only, atomic service-link allow/deny audits and selected regulated/bank/portfolio sensitive read audits in tenant PostgreSQL | Full **all-sensitive-path** audit/retention, signed-in two-tenant/two-business role tests, privacy/legal approval for information sharing; cross-tenant identity matching deliberately **DEFERRED** | M1-01–03; checklist 02,03,15,17,18 | **PARTIAL CODE / RELEASE BLOCKED** |
| **M2 · Business units and staff** | Isolated business units, employee assignment and revocation, owner/admin screens, role/licensing/affiliation gateway validators | Verified actual legal entities/ownership, licensed employer/firm sponsorship, official professional verification and employee/grant revocation in authenticated staging | M2-01–03; checklist 02,03,10,17,18 | **PARTIAL CODE / RELEASE BLOCKED** |
| **M3 · Client consent, onboarding, documents** | Version/purpose scoped consent, verified Clerk-email client portal (default OFF), HMAC acceptance metadata, immutable PostgreSQL consent evidence, withdrawal/expiry checks, private version-pinned document upload/quarantine/CLEAN-only downloads, write-once retention/hold/suppression metadata, tests; Round 23 strengthens fail-closed historical withdrawn grants | Approved enforceable e-sign vendor and exact disclosure text; client login, consent race/expiry/withdrawal E2E; actual private S3/KMS/WORM/ClamAV outcomes, hold release/erasure legal policy, historical migration and backup/rollback rehearsal | M3-01–07; checklist 02,04,05,16,17,18 | **PARTIAL CODE / RELEASE BLOCKED** |
| **M4 · Workflows, calendars and scheduling** | Employee work queue, manager reassignment/escalation, recurrences, alerts, appointments with PostgreSQL overlap exclusion, private employee calendar consent and delegated OAuth gateway/outbox; safe UNKNOWN/cancel reconciliation, bounded paging/worker health, **241-appointment PostgreSQL** regression | Actual delegated Google/Microsoft calendar gateway create/status/cancel, scheduled deployment and paging, employee communication privacy/cancellation E2E and provider sandbox; cross-tenant calendar conflict detection intentionally **DEFERRED** | M4-01–08; checklist 02,03,06,15,17,18 | **PARTIAL CODE / RELEASE BLOCKED** |
| **M5 · Accounting, bookkeeping, payroll, tax** | Case-to-existing-entity and approved service mapping, USD bank feed normalized import/review, read-only balanced GL previews; default-OFF, three-person manual bank posting path with isolated PostgreSQL balanced JE/replay/concurrency/closed-period tests; tax workpaper snapshot reviews; certified-gated payroll dispatch/status and **server-bound POSTED-run request/reviewer/operator** approvals with PostgreSQL source uniqueness, audit provenance and consent rechecks | **No certified** real bank/Plaid source + webhooks/reconciliation, production GL settlement/reversal and cross-database consent race proof, certified payroll calculations/ACH/tax payment/wage receipt, actual return prep/e-file, professional and finance signoff; no live funding/filing approval | M5-01–06; checklist 07–09,14,16–18 | **PARTIAL CODE / LIVE FINANCIAL EXECUTION OFF** |
| **M6 · Mortgage, insurance, real estate, investments** | Official-source credential and active affiliation validation adapters, service/handoff-specific consent, 3-person workflow/checklists, opaque service-specific partner coordination (not a regulated transaction), idempotent UNKNOWN reconciliation; Round 23 strict tenant/business/case/workflow/service/partner remote receipt matching | Official NMLS/DOI/DRE/FINRA/SEC/CRD/IARD evidence and firm sponsorship as applicable, four certified partner IDs and scoped APIs, actual licensed origination/binding/agency/investment execution systems, signed sector disclosures and responsible licensed supervision | M6-01–06; checklist 03,04,10,11,17,18 | **PARTIAL COORDINATION CODE / REGULATED EXECUTION OFF** |
| **M7 · AI, invoices, billing, financial reporting** | Minimal metadata-only AI triage with daily budget and independent human review, task follow-up only; consent-bound invoice draft/review/delivery/status adapters, vendor-signed merchant **observations** only; default-OFF monthly **DRAFT-only** subscriptions with 500-plan bounded scan/backlog 503; operational aggregates and separately approved immutable monthly operational snapshots | Contracted AI cost/DPA and tests; merchant charge/settlement/refund/chargeback or true revenue posting; certified invoice and payment vendor; audited general-ledger close, intercompany consolidation, bank cash reconciliation, statutory GAAP/IFRS financials and independent accountant/counsel signoff | M7-01–06; checklist 12–14,15,17,18 | **PARTIAL CODE / REAL MONEY AND STATUTORY REPORTING OFF** |
| **M8 · Security, testing, recovery and deployment** | Versioned migrations; append-only audit/consent/retention DB controls; role/rate/CSRF guards; CI **3 green jobs** at Round 23 SHA; manual-only staging, two-tenant auth E2E, DR/restore and sandbox validation scripts; tenant-only owner/admin security/worker dashboard and signed health monitoring adapter | **Actual** private HTTPS staging at pinned SHA, real verified Clerk role/e-sign client sessions, full sensitive-read audit and independent WORM receipt, least-privilege vault rotation, live encrypted PITR and witnessed RPO/RTO, load/pen/accessibility tests, external incident pager/runbook, security/legal/licensing/privacy signoffs and actual authorized go/no-go | M8-01–12; checklist 02–05,15–18 | **PARTIAL CODE / NO STAGING ACCEPTANCE OR RELEASE AUTHORIZATION** |

### Precise remaining work (code vs real-world dependencies)

- **Code + independent evidence still outstanding:** all-path sensitive-access audits and privacy-limited immutable external archival; complete client portal/e-sign and document hold-release/erasure policy implementation; end-to-end tested two-tenant identity/consent/grant-revocation; source/legacy cross-database approval and consent revocation races; provider settlement/reconciliation/refunds/tax filing; qualified financial close/consolidation; automation monitoring/worker alerting; role/accessibility/security performance fixes found during the real pilot.
- **Externally blocked even with perfect CI:** legal entity/staff/sponsorship verification, provider onboarding and sandbox API credentials, approved e-sign/retention/DPA, distinct true practitioner licenses and firm memberships, private S3/KMS/ClamAV/WORM, bank/merchant/AI/calendar/payroll gateways, actual restore and recorded RTO/RPO, real browser sessions, third-party penetration/a11y/security review, authorized deployment/rollback and signed release owner.
- **Safe deferrals:** optional cross-tenant person matching (M1-01), cross-tenant shared appointment conflict service (M4-07), and optional outbound SMS/email; these are **not** secretly turned on or counted as accomplished.
- **Financial/regulated truth constraints:** bank posting and provider activations must stay default-OFF; a **POSTED** ledger run is not paid payroll, an invoice **SENT** or merchant observation is not collected cash, an AI suggestion is not a posted GL action, and a regulated handoff **SUBMITTED** is not a signed loan, bound policy, executed real estate transaction or securities trade.
- **Deployment constraint:** keep PR #24 **draft and unmerged**, with `main`/the current production Vercel deployment unchanged until a separately scoped, human-signed cutover is authorized.

### Release progress accounting

| Verification type | Measured result | Interpretation |
| --- | --- | --- |
| Last inspected code baseline: Round 23 GitHub Actions | **3 of 3 jobs PASS** at the cited SHA | Tests of committed implementation, including disposable PostgreSQL |
| Verified real provider onboarding / test tenant acceptance | **Not established** by source and GitHub CI | Must obtain owner/provider evidence on checklist |
| Independently authorized milestones | **0 / 8** | Every milestone has at least one unresolved production gate |
| Authorized production deployment | **NO** | No merge, production credential activation or cutover authorized |

**Old implementation history begins below.** The older Round 14/earlier
tables intentionally remain for development traceability only. For what to
supply, always use the **single Round 24 owner-supply checklist**, not
multiple overlapping round notes.

---

## Verified milestone status — Round 14 reconciliation (2026-11-11)

**Historical Round 14 snapshot, superseded by the Round 24 status above.** The original M1-M8 milestone summaries
immediately below are historical baseline notes, NOT current feature
inventories. Later rounds supersede their "not implemented" statements.
This table reconciles the branch through Round 13 against committed code
and the successful GitHub Actions build and PostgreSQL integration checks
on commit `a9996501cd48bc40203937829afcc74426f2bdf9`:
https://github.com/awesso007/kobia-platform/actions/runs/43046288490 .
It does **not** establish that any live provider, signature, sandbox,
accessibility audit, backup/restore drill, deployment or production
compliance sign-off has passed.

| Milestone | Verified development state | Not complete / evidence needed | Production status |
|---|---|---|---|
| **M1 Client profile** | Tenant-local profiles, employee directory, business/service links, explicit per-user grants and revocation; Round 13 service-grant UI. Unit/DB/CI evidence. | Comprehensive audit of authorized and denied service record reads, real authenticated 2-tenant/2-business grant-revoke E2E, legal/privacy review; optional cross-tenant identity matching intentionally deferred. | **PARTIAL / BLOCKED** |
| **M2 Business units and staff** | Tenant-local units, assignment/revocation guards, owner/admin provisioning UI, credential/affiliation verification adapters; CI build. | Legal-entity mapping and independently verified staff/firm licensing, assignment/renewal evidence and signed-in revocation tests. | **PARTIAL / BLOCKED** |
| **M3 Consent, onboarding, documents** | Purpose/version consent with Clerk email match, immutable acceptance metadata, withdrawal and DB write-once trigger; disabled-by-default self-service consent portal; version-pinned S3 quarantine/scanning adapters and authorized employee document UI. CI/PG checks. | E-sign provider where required, legal text approval, real Clerk customer E2E, S3/KMS/ClamAV credentials, retention/legal holds, real scanner tests and signed production migration rehearsal. | **PARTIAL / BLOCKED** |
| **M4 Work management and scheduling** | Employee tasks, manager queues, recurrences, appointments/collision guards, consent-gated calendar outboxes, alerts, worker status and UI. CI/PG checks. | Real approved employee OAuth/calendar gateway, provider create/status/cancel sandbox, scheduler operations/alerts, privacy and accessibility acceptance. | **PARTIAL / BLOCKED** |
| **M5 Accounting, bookkeeping, payroll, tax** | Explicit existing-entity finance link and read-only ledger/employee counters, bank feed UNMATCHED import/review, tax workpaper review, payroll vendor status and employee screens; CI/PG checks. | Approved ledger journal posting/reconciliation, real bank feed consent/webhooks, certified payroll funding/tax remittance and verified deposits, actual tax preparation/e-file receipts and independent provider sandboxes. | **PARTIAL / BLOCKED** |
| **M6 Mortgage, insurance, real estate, investments** | Credential and affiliation status gates, service-case consent, licensed handoff coordination, intake/checklists, employee case and registry UI; CI/PG checks. | Official registries/partner agreements, live credential and firm affiliation evidence, regulator-approved disclosures, licensed origination/binding/agency/advisory/trading systems and independent supervision. | **PARTIAL / BLOCKED** |
| **M7 AI, billing, reporting** | Guarded AI task suggestions with human review, digest-only independent approvals, draft invoice approval/void/delivery adapters, operational reports, review UI and worker metrics; CI/PG checks. | Contracted AI and invoice providers, production payment/subscription/settlement, ledger-posting controls, period close/consolidated financial reports, audited figures and sandbox/consent/legal acceptance. | **PARTIAL / BLOCKED** |
| **M8 Security and release** | Versioned tenant migrations, append-only audit/consent DB triggers, scoped response/request protections, CI and PostgreSQL integration, security smoke, protected manual staging/E2E/DR scripts, WORM archive placeholder; CI passed on Round 13 SHA. | Protected actual staging run, real signed-in E2E, independent WORM/backup restore RPO/RTO, least-privilege infrastructure, production dependency review, accessibility/load/penetration tests, incidents/on-call and signed production go/no-go. | **PARTIAL / BLOCKED** |

**CI verified:** branch SHA `a9996501cd48bc40203937829afcc74426f2bdf9`
had completed/success `build` and `chess-db-integration` jobs
(GitHub Actions run `43046288490`). Subsequent Round 14 commits
require their OWN CI verification; this paragraph is a dated baseline.

**Remaining-item IDs and acceptance:** 
`docs/CHESS_CORP_2_ROUND11_OPEN_ITEMS.md` (updated for new
Round 12/13 code as documented later in this file).
Round 13 screen inventory and provider inputs:
`docs/CHESS_CORP_2_M8_ROUND13_EMPLOYEE_SCREENS.md`.
The release hold applies to all eight milestones; no item should be
described as production complete on the basis of green CI alone.

**Round 14 engineering priority addressed:** M1-02 / M8-09,
privacy-minimal audit events for actual, allowed, missing and denied
client-service link reads. Read authorization, its decision record and
the return of an authorized link are now coupled in a tenant-local DB
transaction. The service never returns a sensitive link when the
audit event cannot be written. PostgreSQL regression and unit coverage
were added. This is a *code-level subset* of M1-02 and M8-09;
authenticated real-tenant E2E, any remaining sensitive access paths,
external WORM, independent privacy review and production evidence
are **not** closed. This text describes the implementation, not
the still-running final Round 14 CI result.

## Milestone 1 - Unified Client Profile: development implementation
- Tenant-local profile, separately permissioned service links and grants.
- Business-scoped service links, explicit revocation and CRM directory.
- No cross-tenant/client identity matching is implemented.

## Milestone 2 - Business units and employee assignments: core implementation
- Tenant-local ChessBusinessUnit and ChessEmployeeAssignment tables.
- Assignments are restricted to active tenant memberships.
- Revocation and active-assignment checks.
- Business directory and guarded HTTP endpoints.
- Legal-entity verification, ownership structures and credential validation
  are still required. A business unit label alone is not a legal entity.

## Milestone 3 - Client consent and onboarding: partial
- Purpose/version/status/expiration/withdrawal metadata and pending consent API.
- Intake checklist model.
- No mechanism grants a client's consent, collects documents, or produces valid
  e-signatures. PENDING does not authorize sharing. Requires client auth and
  verified signature/consent evidence before release.

## Milestone 4 - Operations workflows: partial
- Scoped work-item model, assignment validation and basic read/create API.
- Recurrence, calendar conflict checking, manager queues, alerts, workflows and
  optimistic concurrency require implementation.

## Milestone 5 - Accounting/tax/payroll orchestration: partial
- Generic service-case model and consent gating.
- This is not a payroll processor, tax return preparation system, general
  ledger, bank integration or client-specific accounting engine.

## Milestone 6 - Mortgage/insurance/real estate/investments: partial
- Explicit service classification and VERIFIED/expiry credential gate.
- Credential status is not independently verified yet.
- Does not originate mortgages, quote policies, manage investment trades or
  perform real estate brokerage transactions. Legal/compliance approval required.

## Milestone 7 - AI and approvals: partial
- Digest-only approval queue; no source financial data stored in approval rows.
- Review must be by a separate active admin/owner.
- Approval does not automatically execute a financial action.
- Billing, reporting, transaction safeguards, idempotency and supervised AI
  execution remain outstanding.

## Milestone 8 - Production hardening: partial
- Security-event table and server-side append function.
- No assertion of append-only DB controls, external audit archive, pentesting,
  e2e coverage, tenant-schema migrations, backups or production deployment.

## Blocking release gates
1. Migration and rollback plan for every tenant schema, including migration
   compatibility with existing CRM data.
2. Signed-in client consent capture with unforgeable provenance and withdrawal.
3. Cross-business record policy and formal legal/privacy review.
4. End-to-end scoped record policies; audit every access/grant/revoke.
5. Actual license verification and service-provider affiliation checks.
6. Idempotent billing and controlled AI/financial action execution.
7. Unit, PostgreSQL integration, E2E, accessibility, load and penetration tests.
8. Secure environment, backups, recovery drill, observability, staging pilot.
9. Independent compliance sign-off before sensitive production data or launch.

Completed tasks in this branch represent committed development code only.
Do not merge or deploy solely based on the existence of these models.


## 2026-11-10 follow-up implementation
New code commits have added the following beyond the initial models.

### M3 authenticated consent and private documents
- Consent acceptance requires a signed-in Clerk identity, verified primary email
  matching the linked client contact, matching policy version, explicit acceptance,
  evidence HMAC and conditional pending-to-granted update.
- Service authorization rejects GRANTED flags without recorded acceptance evidence.
- Authenticated withdrawal and same-origin JSON mutation checks.
- Private S3 presigned upload with service write grant, size/type restrictions,
  metadata validation, mandatory quarantine, and READY-only short-lived downloads.
- Scanner callback verifies a 5-minute HMAC over tenant, timestamp and exact body.
  READY requires trusted CLEAN result plus consistent object HEAD metadata.
- Not complete: no configured scanner provider or production S3 credentials;
  signature/evidence provider and document retention policies still required.

### M5 accounting / payroll adapter
- Read-only counts from existing legacy Entity, Account, JournalEntry, Employee,
  and PayRun records, linked via explicit ChessFinancialLink.
- Active legacy tenant ID is resolved from the validated tenant slug.
- Not complete: no payroll calculations/disbursement, payroll tax filing, external
  bank connection, or transaction-level integration through these CHESS APIs.

### M6 credentials
- VERIFIED alone is insufficient; verification timestamp, reviewer, registry
  source and current check date are needed for regulated service case assignment.
- Not complete: connection to actual official license registries and review/audit
  policy, broker/firm affiliation verification and external execution integrations.

### M8 migrations and hardening
- Additive Prisma tenant SQL migration covering M1-M8 data models.
- PostgreSQL CI test job applies migrations and tests data isolation and revocation.
- DB trigger prevents update/delete of ChessSecurityEvent rows.
- Middleware forwards sanitized tenant context via request headers for CRM and
  CHESS API paths. Client-controlled x-tenant headers are removed.
- CHESS mutation APIs require same-origin JSON requests.
- Not complete: deployment secrets, vulnerability review, database roles,
  production schema rollouts, recovery drills, dedicated scanner, penetration
  tests, client portal UX, signature provider, third-party compliance approvals.

### Environment for production (set in secret manager; never commit values)
- DATABASE_URL and DIRECT_URL (tenant database and migration connection)
- Clerk publishable/secret keys (real credentials)
- NEXT_PUBLIC_ROOT_DOMAIN / NEXT_PUBLIC_DEFAULT_TENANT / CHESS_PUBLIC_ORIGIN
- CHESS_CONSENT_EVIDENCE_KEY (strong HMAC key, 32+ characters)
- CHESS_DOCUMENT_SCAN_KEY (strong HMAC key, 32+ characters)
- KOBIA_S3_BUCKET, KOBIA_S3_REGION, KOBIA_S3_ACCESS_KEY_ID,
  KOBIA_S3_SECRET_ACCESS_KEY and optional KOBIA_S3_ENDPOINT
- Signed scanner integration that sends HMAC-authenticated CLEAN/INFECTED events

## Explicit production hold
Code-level milestones and CI jobs do not mean Milestones 3-8 are
production complete. Do not merge or deploy to handle real regulated client
records until all release gates are independently verified.


## 2026-11-10 continued implementation: document integrity and task concurrency
- **M3 document integrity (code and tests):** private S3 documents now require
  versioned object storage; upload confirmation records the version ID and ETag.
  ClamAV and optional signed scanner callbacks read the exact recorded version,
  and presigned downloads retrieve only that version after matching metadata.
  A reusable fail-closed integrity policy has unit tests; PostgreSQL migration
  and integration tests cover version metadata.
- **M4 task lifecycle (code and tests):** assigned staff can request explicitly
  allowed task-state transitions; updates require an expected timestamp,
  reject stale writes, and commit an append-only audit event atomically.
- **M8 staging validation:** the read-only infrastructure preflight verifies
  S3 versioning is Enabled; permission and backup requirements are documented.
- These are code-level implementations, not evidence of external service
  activation or production release.

### Current remaining release gates
1. Production S3 bucket, encryption/KMS policy, versioning, private ClamAV and
   scheduled scan worker deployment, plus end-to-end test files.
2. Signed and legally reviewed client disclosure/e-signature integration where
   the relevant regulated service requires it.
3. Recurring operational workflows, calendar synchronization, staff alerts,
   manager reviews, and user-facing task update controls.
4. Approved payroll vendor sandbox submission and reconciliation, actual
   withholding/funding/tax calculations; no live transfers without compliance.
5. Official NMLS / insurance / real estate / securities registry contracts
   and broker/employer affiliations verified by authorized professionals.
6. Full bank, accounting, payroll and regulated-service integrations, billing,
   cross-business reporting and supervised AI actions.
7. Authenticated multi-tenant end-to-end tests, performance/accessibility tests,
   external penetration test, backups and recovery exercise.
8. Staging pilot, audit/incident response, privacy/regulatory sign-off and
   approval for live data before production deployment.

**Release hold stays in force.** Missing provider credentials or an unverified
staging run cannot be reported as a completed production milestone.


## 2026-11-10 continued implementation: scheduled operations and manager controls
- **M4 recurrence code:** tenant-local ChessWorkRecurrence with UTC daily, weekly
  and monthly schedules, month-end anchoring, a versioned PostgreSQL migration,
  unique occurrence keys, and worker-side transaction claims.
- **M4 employee alerts:** private per-recipient notification inbox with dedupe
  keys, mark-read API, automatic notifications for assigned manual/recurring
  work, and server-side access checks.
- **M4 manager oversight:** active business-unit MANAGER role can view blocked,
  overdue and unassigned work, and perform concurrency-safe staff assignments.
  Other members cannot retrieve coworkers' manager queues.
- **M4 application UI:** /app/work-items provides task transitions, an employee
  notification list and manager oversight summary.
- **M4 calendar export:** authenticated, privacy-preserving UTC iCalendar
  export for authorized work. No client names or regulated records are included.
- **M4 recurring worker:** token-gated POST per tenant, a disabled-by-default
  scheduler workflow and tenant allowlist example. No live recurring work is
  processed until the scheduler is configured and enabled.
- **M8 checks:** unit tests cover recurrence date arithmetic, transitions
  and worker authorization; PostgreSQL integration tests enforce unique tasks
  and alerts; anonymous-access security smoke tests include new endpoints.
- Not complete: live calendar OAuth synchronization, staff alerts beyond the
  in-app inbox, appointment booking/collision prevention, scheduler monitoring,
  staging deployment, production provider configuration and compliance review.

## Remaining prioritized engineering work
1. Real calendar-provider integration with delegated access and cancellations.
2. Scheduling observability, repeated failures and overdue notification policies.
3. End-to-end multi-tenant role/permission tests with realistic sign-in.
4. Provider sandbox validation (payroll, registry, e-signature, private storage).
5. Accounting, tax, billing, cross-business reporting and supervised AI modules.
6. Disaster recovery, external penetration testing, accessibility and compliance.
7. Production-like staged pilot and verified production release gates.

The presence of these commits does not establish production readiness.


## 2026-11-10 continuation: calendar gateway and employee controls
- **Calendar outbox:** tasks with an active assignee and due date create
  per-employee private calendar events in the same database transaction as
  the task. A unique work-item key prevents duplicate deliveries.
- **Optional calendar gateway adapter:** allows only a configured HTTPS host,
  vendor token and explicit `CHESS_CALENDAR_SYNC_ENABLED=true`. It sends
  generic event descriptions; the vendor gateway must resolve per-employee
  delegated OAuth authorization. It is not enabled by default.
- **Calendar reconciliation safety:** pending outbox messages are claimed
  atomically, and uncertain network outcomes are marked UNKNOWN rather than
  resent automatically. Calendar synchronization is not a confirmed event
  until the external vendor acknowledges it.
- **Employee dashboard:** manager controls create/pause/resume recurrence,
  task status changes use optimistic locking, and employees can mark private
  notifications as read.
- **Testing:** PostgreSQL integration tests enforce uniqueness of calendar
  outbox records; CI HTTP smoke covers unauthorized calendar worker access.
- **Remaining M4 blockers:** live vendor sandbox, employee OAuth consent
  screens, provider event cancellation/update reconciliation, collision
  checks, user-friendly employee selection, overdue reminders and calendar
  bidirectional sync. These still need code and external sign-off.
- **No production release:** configuration placeholders cannot establish
  provider permission, privacy compliance or reliable deployment.


## 2026-11-10 continuation: employee calendar consent and remote cancellation
- Employee-specific `ChessCalendarPreference` allows explicit individual opt-in
  and opt-out with authenticated Clerk membership and append-only audit event.
- No external event is sent unless the employee has opted in AND the calendar
  gateway has been activated; messages wait in WAITING_CONSENT otherwise.
- Optional calendar gateway must provide BOTH idempotent create and cancel
  endpoints at an allowlisted HTTPS host. OAuth consent is separately checked
  by the approved gateway.
- Task cancellation and calendar opt-out queue removal of events already sent.
  Cancel-unknown outcomes are preserved for manual reconciliation; no blind
  retries that could produce duplicate or inconsistent calendar events.
- New status enums are covered by versioned tenant-schema migrations.
- Still incomplete: live OAuth provider connection, provider sandbox testing,
  webhook reconciliation of unknown outcomes, real scheduling collision checks,
  deployment, backup restore, penetration testing and compliance approvals.


## 2026-11-10 scheduled overdue reminders
- Scheduled recurrence worker now also generates deduplicated, private in-app
  overdue reminders for eligible active employees and blocked-work alerts for
  active unit managers. Repeated worker runs on the same UTC day share a
  deduplication key and cannot flood a recipient with duplicate alerts.
- Current worker scans a bounded set of overdue tasks per pass; monitoring
  and fleet-scale pagination remain necessary before high-volume production.
- No real employee email/SMS is transmitted by this code. The employee inbox
  is the delivery channel until a provider is configured and approved.


## Round 3: Milestone 4 operational feature completion (development)
- **Staff appointments:** dedicated business-local booking model, manager-only
  create/list/cancel APIs and appointment booking UI with active employee
  dropdowns. PostgreSQL `btree_gist` exclusion constraint rejects overlapping
  SCHEDULED times for the same employee across business units inside the same
  tenant. Adjacent slots and rebooking after cancellations are permitted.
- **Manager assignment UI:** formerly unassigned work can be assigned to an
  active business-unit employee with optimistic-locking to prevent overwrites.
- **Calendar reconciliation:** the approved gateway must provide a read-only
  status endpoint in addition to idempotent event creation and cancellation.
  UNKNOWN or CANCEL_UNKNOWN events are checked by idempotency key; a missing
  or pending response is NEVER treated as permission to resend.
- **Calendar revocation race:** the worker rechecks employee consent and
  task assignment before marking remote delivery synchronized; delivery that
  outlives revocation is queued for cancellation rather than accepted silently.
- **Owner/admin visibility:** operational dashboard shows last worker heartbeat,
  due recurrence backlog and unresolved calendar outbox counts.
- **Coverage:** appointment PostgreSQL overlap tests, calendar provider mock
  status-contract tests, status-decision unit tests and anonymous HTTP
  endpoint access checks added to CI.

### Remaining non-code rollout gates for Milestone 4
1. Provide a contracted calendar gateway, its three HTTPS API URLs,
   host allowlist and API secret; the gateway must separately hold verified
   delegated employee Google/Microsoft consent. The adapter is disabled.
2. Run real provider sandbox create, cancel and reconciliation tests with
   a dedicated test employee; do not connect personal calendars by default.
3. Approve employee-facing privacy copy and retention policy.
4. Deploy private scheduler, monitor failures, restore from backups and
   verify authorized multi-tenant staging workflows with real test accounts.
5. Appointments are internally booked with overlap protection. They are not
   automatically transmitted to third-party calendars through the work-item
   outbox; connecting them requires an approved appointment-specific bridge.

Milestone 4 is feature-implemented in the development branch for internal
operations, but is not operationally complete in production until the external
items above are verified. Do not claim a production release.


## Round 3 follow-up: internal appointment lifecycle and reminders
- Business-unit managers can mark previously scheduled appointments completed
  after their end time, or cancel with stale-update checking.
- Appointment creation and cancellation generate staff notifications, and the
  scheduler generates a deduplicated reminder within an hour of the start.
- Staff can download their own appointment times as a private generic
  iCalendar file without client identity or subject details.
- PostgreSQL rejects overlapping active appointments for one employee even
  when booked by different CHESS business units in the same tenant.
- External calendar event automation for appointments remains disabled;
  privacy, OAuth, and production staging requirements still apply.


## Round 4 - appointment calendar automation (development branch)
- Appointment creation now atomically inserts a separate, uniquely keyed
  ChessAppointmentCalendarOutbox record. Employee opt-in controls whether
  the event is PENDING or WAITING_CONSENT. No customer name, appointment
  subject or service-specific data is sent to the gateway.
- Appointment cancellation atomically cancels unsent items or queues
  a remote deletion for previously synchronized items. Employee opt-out
  affects both appointment and task queues.
- The machine-authenticated tenant calendar worker now processes both
  resources, including provider cancellation and idempotency-key status
  reconciliation. Stale SUBMITTING and CANCEL_SUBMITTING claims are converted
  to UNKNOWN/CANCEL_UNKNOWN and reconciled rather than resent blindly.
- Successful provider responses and reconciliation results generate
  append-only CHESS security events; worker health includes separate
  appointment delivery and awaiting-consent counts.
- PostgreSQL integration tests cover appointment calendar queue uniqueness
  and state changes; mocked provider contract tests prove generic payload
  enforcement and strict event-ID verification.
- Manual, disabled-by-default appointment create/status/cancel sandbox
  validation is available in chess-calendar-sandbox.yml, requiring a
  dedicated sandbox environment and a previously OAuth-authorized
  employee test calendar. The real provider has NOT been exercised.
- Milestone 4 rollout still requires the configured real gateway, employee
  delegated OAuth onboarding, real sandbox results, end-to-end role tests,
  staging deployment/monitoring, documented retention and compliance review.
- Appointment conflict prevention is scoped to one KOBIA tenant. Separate
  KOBIA tenants do not share a booking lock or staff directory.

**Status:** Development implementation and automated CI testing only.
Code passing CI does not establish live external calendar availability
or regulated production readiness.


### Separate appointment-calendar consent gate
- Ordinary calendar opt-in previously covered task timing only; Round 4
  adds independent, separately acknowledged appointment sharing permission.
- The additive migration defaults appointment authorization to OFF for all
  existing employee preferences and returns any previously queued,
  unsent appointment events to WAITING_CONSENT.
- Existing task opt-in cannot activate appointment sharing. Employees may
  opt out of appointment timing alone or globally turn off calendar sharing,
  which requests deletion of synchronized events.
- The manager and employee UI now shows two separate opt-in controls.
- Automated unit/integration coverage verifies default denial and revocation.
- Actual OAuth/delegated calendar connection and provider acceptance must
  still be tested with authorized sandbox credentials.


## Round 5 - Accounting, bookkeeping, payroll, and tax integration (development)
- **Accounting + TAX service mappings:** existing entity-ledger bridge accepts
  ACCOUNTING, BOOKKEEPING, PAYROLL and TAX, tied to the current tenant,
  an ACTIVE service case, a service grant and current signed client consent.
  Financial operational summaries never return individual payroll amounts.
- **Bookkeeping bank review:** auditors can propose an offset general-ledger
  account for an unmatched, same-tenant legacy bank transaction; reviews
  include a cryptographic fingerprint of original bank evidence. Different
  active staff members must propose and approve. A stale or changed bank
  transaction is not eligible. No automatic journal posting or matching occurs.
- **Optional bank feed:** explicit inactive-by-default bank/account mapping,
  consent checks for BOTH business service and bank-feed purpose, approved
  host-pinned Plaid gateway adapter, narrow 90-day import window, strict USD
  posted transaction schema, per-tenant/bank/provider-ID idempotent imports,
  records initially UNMATCHED in the legacy ledger only. Sync attempts are
  auditable and retry-safe; no passwords or provider tokens are stored in the
  CHESS CRM schema.
- **Tax workpapers:** posted general-ledger entries are read in bounded
  source snapshots; unbalanced entries are rejected, cryptographic evidence
  is recorded, and a separate creator, reviewer and final approving admin
  must be used. If source evidence changes the snapshot is SUPERSEDED.
  Tax workpaper APPROVED means internal evidence review, NOT a tax return,
  e-file, electronic signature or taxing-authority acknowledgment.
- **Payroll outcome status:** separate disabled-by-default read-only provider
  status adapter polls opaque existing submissions. Vendor 'accepted' is
  SUBMITTED, vendor 'paid' is PROVIDER_PAID (not confirmed settlement),
  failed is PROVIDER_FAILED, and uncertain remains UNKNOWN. Status responses
  must match pay-run and provider request references; stale timestamps may
  not override later evidence. The worker cannot submit a new payroll run.
- **Payroll execution hardening:** before any approved dispatch, the code now
  rechecks payroll client consent, active case/service grant, mapped entity,
  and the continued active status and manager/admin role of the independent
  approver. Existing real execution remains disabled until certified.
- **UI:** /app/finance-operations shows separate business scoped queue metrics,
  authenticated and service-granted finance cases; per-case views allow
  human bookkeeping review and tax workpaper review or read-only payroll
  reporting without client data crossing service boundaries.
- **Testing:** unit tests for bank transaction source digests, tax balanced
  books and independent review, bank provider contract/idempotency, and
  payroll outcomes. PostgreSQL CI validates unique bank decisions, workpaper
  evidence versions, feed mappings, import history and provider status.
  HTTP smoke probes unauthenticated finance routes and machine-only status API.
- **Provider validation:** bank feed sandbox contract workflow is manual-only,
  read-only and uses an isolated fake bank account. Calendar and payroll
  provider credentials are not available in CI; live integrations are not
  exercised.

### Remaining mandatory M5 release gates
1. Active KOBIA ledger with customer entities, chart of accounts, bank
   accounts, posted journal entries and a tested reconciliation/posting
   engine; independent approval must be enforced in that engine.
2. Plaid-backed (or separately adapted) provider contract, verified customer
   bank consent, scoped vault credentials, production webhooks, sandbox
   account mappings, reliable incremental pagination and audit/retention.
   Provider-backed import is OFF pending these requirements.
3. Contracted payroll processor with certified wages/tax computation,
   funding controls, ACH approvals, disbursement reconciliation, state/federal
   tax filing and remittance, employee onboarding and settlement evidence.
   Vendor 'paid' alone does NOT prove bank or tax settlement.
4. Contracted professional tax preparation/filing software, valid preparer
   authorizations, reviewed tax computations and actual federal/state e-file
   acknowledgments. Internal CHESS workpapers are not a tax preparation engine.
5. Live provider sandbox end-to-end tests, realistic staff/consent role tests,
   independent security/compliance review, tenant migrations to staging,
   disaster recovery and verified production deployment.

These are production blockers, NOT items silently marked complete by code or
green GitHub CI. CHESS and each licensed operating company must preserve
their separate legal scopes and data-sharing permissions.


## Round 6 - Regulated mortgage, insurance, real estate and investments (development)

- **Service-specific workflows:** MORTGAGE application coordination/document
  intake, INSURANCE coverage/application intake, REAL_ESTATE buyer/seller
  intake, and INVESTMENTS goal/risk discovery have separately typed workflow
  kinds and per-service required manual checklists. These are private
  case-coordination records; no financial/health/property application payload
  is stored in the new workflow metadata tables.
- **Segregation of duties:** the original creator, independent reviewer and
  final approving owner/admin must be different active employees. Each case
  requires a current explicit service-write grant and validated client
  acceptance for the service. Provider handoff additionally requires a
  separate purpose-bound external_handoff client consent.
- **Professional authorization:** check current verified individual
  credential, approved official registry source, active employee assignment,
  independent reviewer's identity, and a distinct recently verified
  practitioner-to-employing-firm/partner affiliation. Affiliation registration
  starts UNVERIFIED. A separate allowlisted HTTPS official evidence provider
  is the only path to mark it VERIFIED.
- **Private documents:** optional checklist evidence references only an
  authenticated client's own READY, scanned, immutable-version document.
  Raw document contents are not sent in coordination requests.
- **Provider boundary:** disabled-by-default, allowlisted HTTPS gateway
  accepts only opaque tenant/business/case/workflow identifiers, typed
  coordination kind, idempotency key, and contractually approved partner ID.
  Acknowledgment means a request for coordination was received. It cannot
  originate a mortgage, issue an insurance quote or policy, create/bind
  a brokerage contract, provide investment advice, or place trades.
- **No blind retries:** uncertain external submissions remain UNKNOWN and
  can only be checked by a read-only status lookup tied to the original
  idempotency key and provider request ID. Consent and current individual/
  firm eligibility are rechecked after remote acknowledgment.
- **Interface:** /app/regulated-services lists only service cases with
  explicit record grants and validated client consent, provides official
  affiliation verification controls and separate case intake, checklist,
  review, approval, partner ticket and reconciliation actions.
- **Testing:** policy/segregation/idempotency unit tests, official source
  validation and provider payload tests, PostgreSQL uniqueness and
  optimistic-lock regression, anonymous HTTP route-denial checks.
  Manual protected `chess-regulated-sandbox.yml` contract tests are ready
  but CANNOT run until authorized fictional provider sandbox credentials
  and official test registry evidence are supplied.

### M6 still BLOCKED for real clients
1. Firm and individual registry coverage and contractual authority for
   each licensed service/jurisdiction (NMLS, state DOI, DRE and applicable
   CRD/IARD/SEC/FINRA registries; independent compliance validation).
2. Authenticated signed client service and external-handoff disclosures,
   broker/company sponsorship and affiliation verification.
3. Four approved provider/partner identifiers, real delegated connection,
   sandbox create/status acceptance, revocation/deletion/retention behavior,
   and vendor incident/compliance agreements.
4. Separate licensed systems for loan origination and disclosures, insurance
   quoting/binding, real estate agency/offer documents, investment suitability,
   supervision, disclosures and transactions. None is implemented by these
   opaque coordination workflows.
5. External penetration/role testing, staging deployment and legal
   authorization before handling any regulated real client data.

**M6 is code-implemented for internal metadata coordination only, not a
production-approved end-to-end regulated execution platform. Green CI alone
does not satisfy the five mandatory gates above.**


## Round 7 - supervised AI, invoice billing and operational reporting

**Development implementation (NOT production service activation):**
- **AI assistance:** approved, host-pinned API accepts only generic work-item
  status, deadline bucket and assignment-presence flags. It returns strict
  enumerated priority/action/rationale metadata; no prompts, client IDs,
  case descriptions, payroll details or tax content are sent.
  Proposals are deduplicated against a SHA-256 digest of the current
  tenant/business/task state. A changed task invalidates stale advice.
  Separate active administrators review all results. Acceptance does NOT
  modify source work or authorize any financial execution. An additional,
  explicitly initiated administrator action can apply accepted, still-fresh
  advice by creating one generic follow-up task and private alert, with
  transactionally idempotent execution. Original tasks stay unchanged.
- **Scheduled AI:** existing tenant-allowlisted, bearer-token-verified
  scheduler can generate a maximum of 25 unapproved proposals per tenant
  run, only when the data-sharing/vendor/scheduler gates have been explicitly
  approved. A failed suggestion leaves the source work item unchanged.
- **Billing:** active accounting, bookkeeping, payroll or tax service
  cases with an explicit per-client write grant and separate
  `service:<SERVICE>` and `billing:<SERVICE>` signed consents may create
  typed USD invoice drafts. Fixed service codes, amount ceilings, source
  fingerprints, unique request keys and serial state transitions prevent
  ordinary duplicate invoice requests. An independent administrator
  approves the draft; a different active sender may request an opaque
  invoice-delivery ticket. Delivery UNKNOWN is reconciled by the original
  key and confirmed provider ID, never automatically submitted twice.
  No payment, card charge, ACH, debt collection or ledger posting occurs.
- **Reporting:** new `/app/operations-intelligence` page and
  `/api/chess/operations-report` JSON/CSV endpoint report business-unit
  service-case, task, supervised AI, consent and licensed coordination
  counts, plus invoice counts and total invoice amounts by vendor
  delivery status. Reports contain no per-client records or banking data.
  They are operational statistics, not booked GL income, settled payments,
  month-end position or consolidated statutory statements.
- **Controls and tests:** tenant-local AI/invoice Prisma models and a
  versioned PostgreSQL migration; database uniqueness and positivity
  constraints; independent-approval and constrained-output contract tests;
  anonymized HTTP auth smoke probes; disabled-by-default external AI
  and billing gateways; compliance-aware deployment preflight; optional
  manual-only fictional-provider sandbox contract workflow.
- **Launch status:** Ordinary CI exercises mock external vendors and the
  PostgreSQL tenant schema. It does not establish actual AI API uptime,
  electronic invoice receipt, bank or tax settlement, billing licensing,
  cross-company consolidated reports, or a live deployment.

### Mandatory Round 7 external blockers
1. Contracted, reviewed AI provider with an approved HTTPS gateway, scoped
   key, signed privacy/DPA and explicit triage-only data-sharing release.
2. Contracted invoice-only billing provider, client invoice-contact mapping,
   confirmed purpose-bound billing consent, DPA, fee/tax policy, approved
   vendor API and no-payment-charge sandbox. Independent staff must approve.
3. Real payment collection and webhook-backed settlement, merchant
   underwriting, AR postings and subscription management (separate future
   financial execution; NOT enabled by invoice delivery).
4. Historical month-end accounting statements, consolidated financial
   elimination logic, cash reconciliation and report reviewer sign-off.
5. Authorized test tenants and a full staging deployment/security/restore
   pilot plus real provider sandbox evidence before enabling any live job.

**Milestone 7 development code is implemented for restricted, human-reviewed
assistance and invoice coordination, but complete end-to-end production
billing, supervised financial AI and audited accounting reports remain
blocked pending provider configuration and independent release controls.**


## Round 8 - audit evidence, backup/restore and release-hardening continuation

### Committed and tested in code (M8 still INCOMPLETE)
- **Audit provenance:** tenant-local `ChessAuditArchiveOutbox` points to immutable
  `ChessSecurityEvent` records with one unique outbox entry per event.
  PostgreSQL requires a signed SHA-256 HMAC digest and a provider receipt
  before an event can be marked ARCHIVED. A second database trigger prevents
  modifying or deleting archived receipts, complementing the existing
  append-only source event trigger.
- **Pseudonymized export:** an allowlisted, HTTPS-only independent archive
  provider accepts bounded batches of source event metadata. Actor,
  business, resource, action classification and resource type are
  HMAC-pseudonymized with a protected
  per-environment key. Free-form event labels are excluded. A delivery
  timeout changes the outbox to UNKNOWN; it is resolved via a read-only
  vendor status lookup, never by blind resubmission.
- **Operational controls:** the archive worker is machine-authenticated,
  tenant-allowlisted, disabled by default, and integrated into the existing
  optional scheduler. Existing restricted worker-health reporting now
  includes archived, pending, unqueued, rejected and ambiguous counts.
  Staging deployment checks reject activation unless approved archive
  retention, secret keys, endpoints and scheduler controls are supplied.
- **Tests:** a source-to-receipt PostgreSQL test asserts uniqueness,
  required receipt fields, archive-row immutability and audit FK checks.
  Unit tests cover HMAC pseudonymization, source-label filtering,
  vendor host validation and strict matching response hashes. HTTP
  security smoke checks anonymous audit worker calls are rejected.
- **Manual provider sandbox:** the protected
  `chess-audit-archive-sandbox.yml` is ready to issue and status-check
  one fictional event, but real provider connectivity cannot be verified
  without the external vault and credentials.
- **Disaster recovery:** a read-only, manually dispatched protected
  `chess-dr-restore-validate.yml` checks the *externally provisioned*
  encrypted/versioned/COMPLIANCE-locked backup object and a separately
  restored tenant PostgreSQL database for a previously recorded immutable
  test event and critical table presence. It performs no backup, restore,
  failover or production mutation. DR evidence requires actual provider
  credentials, a restored clone and independent operator measurements.

### Still blocked before a production release
1. Independent offsite WORM audit archive vendor, signed DPA and validated
   retention/legal-hold guarantees; usable provider credentials, a
   pseudonymization secret rotation plan and an approved sandbox acceptance.
2. Privately provisioned PostgreSQL PITR backups, encrypted object retention,
   recovery operator accounts and a **completed** isolated restore drill
   with measured RPO, RTO, data reconciliation and signed evidence.
3. Authenticated two-tenant/two-business end-to-end authorization tests
   with realistic signed-in staff, consent revocation and CSRF scenarios;
   accessibility, load and independent penetration testing.
4. Alerts/incident response, key rotation and deletion workflows,
   observability, secret scanning, per-tenant rate limits and comprehensive
   rollback compatibility verified on production-like migrations.
5. Actual staging deployment, release freeze, independent compliance/legal
   sign-off and supervised production cutover for each regulated service.
6. M3-M7 provider sandboxes and full financial/regulated transaction
   execution remain external blockers; green CI alone does not close them.

### Round 8 follow-up: Milestone 7 invoice authorization correction
- Invoice submission now requires **three distinct active individuals**:
  the original author, an independently authorized owner/admin reviewer,
  and a separate authorized sender. A creator can no longer send their
  own approved draft, and an approver cannot send the invoice either.
- Invoice listings now recheck each client's current business-specific
  service grant and purpose-bound service/billing consent instead of
  displaying all tenant business invoices to any manager.
- A unit test covers the three-person billing segregation rule. Remaining
  real-provider sandbox billing and subscription/payment settlement
  requirements are unchanged.

**Do not merge, claim a live release, or enable real customer automation on
the strength of development CI and unexecuted manual-only workflows.**


## CHESS CORP 3 development continuation (November 11, 2026)
- **M7 cross-business operational reporting:** A signed-in ACTIVE tenant
  OWNER or ADMIN can export per-unit counts and invoice face-value totals
  from `/api/chess/operations-report/portfolio` as JSON or escaped CSV.
  The query includes at most 100 active business units within the current
  KOBIA tenant. Amounts are exact integer cents, not payments, earned
  revenue, journal balances, statutory consolidation or intercompany
  eliminations. Tests cover RBAC policy and aggregate arithmetic.
- **M8 request limiting:** A new additive tenant-schema PostgreSQL
  migration provisions `ChessRequestRateWindow`. Reporting, AI and billing
  API endpoints now have transactional 60-second per-user and per-tenant
  quotas with HTTP 429 and Retry-After, and fail closed if the DB/migration
  is unavailable. The allowlisted recurring scheduler prunes up to 500
  expired windows per run. Unit and DB integration regressions added.
- **M8 credential scanning:** CI now runs a tracked-source pattern check
  for common live credentials with synthetic scanner tests. This does
  not replace managed GitHub secret scanning, leak response, software
  composition analysis, or an independent penetration audit.
- **Release documentation:** Security incident response, backup, rollback,
  recovery, retention, HMAC key rotation and independent go/no-go evidence
  requirements are in
  `docs/CHESS_CORP_2_SECURITY_RELEASE_RUNBOOK.md`.

### Release blockers remain unchanged
No third-party provider account, signed DPA, regulated sponsor/firm
license verification, real e-signature integration, staging operator
credentials, production S3/ClamAV, authorized sandbox, verified two-tenant
session E2E, restore drill, penetration/accessibility/load audit, deployment
approval or legal sign-off has been supplied and successfully exercised.
Code-only green CI cannot close those gates. In particular the M7 billing
module is *invoice drafting/delivery coordination only*, not a payment
processor, financial ledger posting engine, or tax/payroll provider.

**No merge or production deployment is authorized by this development work.**


## Round 9 - Milestone 7 UI and approval completion (development)

- Standalone authenticated `/app/ai-operations` workflow page shows
  business-specific triage queues, model recommendations and explicit
  independent human review actions. Server-derived action flags prevent
  offering a requester their own approval button; real authorization is
  revalidated by the server. No original task or financial action can be
  executed by an AI suggestion.
- Standalone `/app/service-billing` page allows purpose-bound draft
  creation, separate approval, third-person vendor submission, UNKNOWN
  reconciliation and pre-submission invoice voiding with optimistic
  locking and immutable audit metadata. A previously approved draft must
  be voided by an administrator other than its author. Any potential
  external submission blocks voiding. No money is charged or posted.
- Standalone `/app/operations-reports` supports UTC month/business
  selection and owner/admin-only tenant portfolio summaries. Separate
  JSON/CSV exports are privacy-scoped, CSV formula prefixes are escaped,
  and invoice face values use exact integer-cent formatting.
- CRM navigation and combined operations overview link to the focused
  screens. Regression tests cover invoice role separation and void state,
  arithmetic and CSV escaping; unauthenticated HTTP probes cover portfolio
  endpoints and forged-origin AI/VOID mutations. Release acceptance matrix
  and outstanding provider inputs are documented in
  `docs/CHESS_CORP_2_M7_ROUND9_ACCEPTANCE.md`.

### M7 and M8 production work still REQUIRED
No live AI, billing, payment settlement, payroll, licensed transaction,
client data-sharing or consolidated statutory reports have been approved
by this code. Actual provider contracts and secrets, signed consent,
firm/individual licensing, protected sandbox acceptance, authenticated
two-tenant E2E, independent security/legal review, backup/restore exercise
and staging pilot remain mandatory. A green CI build verifies the
development branch only, not a production release.

**Do not merge or deploy regulated live workflows without external gates.**

### Round 9 follow-up - AI scheduled triage observability
- AI triage worker now creates its own tenant-local `AI_TRIAGE`
  `ChessWorkerRun` record containing only examined/generated/blocked
  counts and run status. This requires additive migration
  `20261111333000_chess_m7_ai_triage_health` applied to every tenant schema.
- Active tenant owners/admins can view last recorded AI-run health inside
  `/app/ai-operations`; managers do not receive tenant-wide worker metrics.
- Tests verify that PostgreSQL accepts the new enum kind and stores bounded
  nonclient worker metrics. Worker errors are reported as failed where
  persistence remains available. No vendor has been activated by this code.

**External gateway and production release restrictions remain in force.**


## Round 10 - Milestone 8 security, E2E, DR and staging hardening

The implementation and operator inputs are documented in
`docs/CHESS_CORP_2_M8_ROUND10_ACCEPTANCE.md`.

- Deployed staging build attestation endpoint and strict, short-lived,
  HTTPS-host-allowlisted manual verifier; anonymous access denied and
  exact expected commit checked. The GitHub protected staging workflow
  also fails on high/critical production dependency audit findings.
- Private app/API no-store, no-referrer, nosniff, anti-frame and
  restrictive browser security response headers; production browser
  mutations require configured canonical `CHESS_PUBLIC_ORIGIN`,
  proper JSON media type and non-cross-site Fetch Metadata.
- Expanded manual-only signed-in 2-tenant/3-session E2E harness
  checks independent access, current consent, service grants,
  authorized reports and forged-origin mutation denial.
- Independent read-only DR check strengthened with separately
  hosted/named restore, verified TLS, nonmutating operator role,
  mandatory restored archive triggers, pinned WORM witness, and
  bounded RTO/RPO operator evidence. No backup or restore is performed
  by a CI job; measured RPO/RTO still require independent proof.
- CI includes new Vitest + Node-native negative/security policy
  tests and existing PostgreSQL integration/security smoke.

**INCOMPLETE RELEASE GATES:** Deployed staging/provider credentials,
real signed-in test sessions, actual backup/restored clone, independent
restoration observation and signing, archival DPA/WORM, independent
vulnerability/accessibility/pen tests, all provider integrations,
compliance/regulated-service legal sign-offs and authorized production
cutover are still outstanding. Do NOT merge or deploy production.


## Round 11 - full Milestones 1-8 reconciliation and M3 security priority

The complete, deduplicated inventory of still-unfinished engineering,
external vendor/credential requirements, staging, privacy and operational
release gates is maintained in
`docs/CHESS_CORP_2_ROUND11_OPEN_ITEMS.md`. The initial summaries at the
start of this document are historical; later development rounds supersede
their claims about missing recurrence, calendar, AI, billing and reporting
code without establishing production readiness.

**Highest-priority code-only risk addressed:** client consent policy and
accepted evidence could not previously rely on a database-enforced
write-once lifecycle. The additive tenant migration
`20261111334000_chess_m3_consent_evidence_integrity` now requires consent
to originate PENDING, rejects policy/subject/expiry modifications,
requires full structured acceptance proof for GRANTED status,
prevents unsupported reversions and all deletion, and permits only
controlled withdrawal or expiry transitions. Administrative requests
and withdrawals now append immutable audit events in the same DB
transaction. Access gates reject malformed or legacy evidence digests.

Automated regression coverage includes consent lifecycle, direct
database attempts to rewrite accepted policy/evidence, invalid grant
evidence, forbidden deletion/regrant and staff-side fail-closed
structural evidence checks.

**Remaining:** Real e-signature/identity source, approved policy and
privacy sign-off, configured secret-vault signing key, historical
key-version validation, per-tenant migration and rollback rehearsal,
real signed-in client portal E2E, data retention/legal holds and safe
external revocation behavior. Applying the migration without a
verified backup and review of existing legacy records is prohibited.
No historical consent evidence is manufactured by this migration.

No merge, production deployment or activation of regulated providers
is authorized. All Milestones 1-8 are still subject to unresolved
external production gates.


## Round 12 - highest-priority remaining M3-01 client portal follow-up

- Added a separate, noindex, private, authenticated client consent
  dashboard and per-consent immutable disclosure viewer with guarded
  acceptance/withdrawal controls. Record selection binds the verified
  primary Clerk email to a tenant-local linked CRM contact and binds
  accepted/withdrawn records to their original Clerk identity.
- The new portal does not require staff CRM membership. Middleware
  reserves the portal path, resolves explicit tenant context for the
  read UI and mutation API, and applies no-store security headers.
- Activation requires all three independently controlled flags
  `CHESS_CLIENT_CONSENT_PORTAL_ENABLED`,
  `CHESS_CLIENT_PORTAL_POLICY_APPROVED`,
  `CHESS_CLIENT_PORTAL_IDENTITY_APPROVED`; missing approvals
  leave the new interface unavailable. A legacy staff-shell
  consent link redirects to the client portal only after activation.
- Unit tests cover identity isolation, expired state and verified
  email contact matching; anonymous portal HTTP checks added.
  Full signed-in E2E and accessibility tests remain unperformed.
- Prior stale onboarding TODO comments were corrected. Existing
  service-consent API retains its audited, origin-restricted
  state changes; no real provider key has been supplied.
- Configuration, acceptance and detailed remaining external gates
  are in `docs/CHESS_CORP_2_M3_ROUND12_PORTAL.md`.

**NOT PRODUCTION COMPLETE:** verified client test sessions, external
signatures when required, legal/identity review, data retention,
full document portal, staged migration deployment and licensed
provider approval remain mandatory. The draft PR must not be merged
or deployed to live client processing on ordinary CI alone.


## Round 13 - employee screens for previously backend-only workflows

Implemented employee and administrator UI for CHESS business-unit
creation/assignments, unified client profile creation, service
provisioning and grant revocation, signed-consent request/status,
consent-gated service case opening/status progression, independent
generic action approvals, protected document upload/quarantine/
READY download, bank-feed registration/pause/import, finance
ledger-entity mappings and official practitioner license checks.

The screens are routed and available through scoped CRM pages;
security-critical external actions remain disabled by default and
their API-level role/consent/license checks are not bypassed.

**Acceptance and exact outstanding vendor/credential inputs:**
`docs/CHESS_CORP_2_M8_ROUND13_EMPLOYEE_SCREENS.md`.

Machine-only workers, encrypted audit exports, document scanner
callbacks, unsupervised payroll funds/disbursement, tax filing,
insurance binding and investment transactions deliberately are
not represented as ordinary employee send buttons. All remaining
M1-M8 provider, staging, E2E, legal and release gates still apply.
This is development branch work only, not a live service launch.


## Round 14 - follow-up M1-02 and M8-09 scoped sensitive read audit

After the eight-milestone baseline reconciliation, the next
implementation added:
- Pure, privacy-limited `serviceReadAuditEvent` factory, with
  **no client name, email, financial detail, external ID or full
  service payload** in log content.
- `auditedClientServiceRead`: tenant-local transactional read,
  explicit current service grant decision, immutable event insert
  for ALLOW/DENY and a separate NOT_FOUND outcome, which is still
  audited as DENY without storing a guessed client ID.
- `getClientServiceLink` now uses this path before returning a
  service link or refusing access. An audit database write failure
  fails access closed. Earlier GRANT/REVOKE changes remain separately
  audited in the same database transaction as their mutation.
- Vitest unit checks for event privacy and PostgreSQL integration
  tests for pre-grant denial, missing link, granted read, revocation
  denial and security event immutability.

**Still incomplete:** No real authenticated 2-tenant E2E or external
WORM receipt verification yet; not every possible sensitive read
path is covered by this one helper. The audit architecture depends
on externally provisioned least-privilege DB roles, backup and
independent archive provider credentials and retention/alert policies.
Deployment and external acceptance remain blocked.

Acceptance and independent inputs:
`docs/CHESS_CORP_2_M1_ROUND14_SERVICE_AUDIT.md`.


## Round 15 - M3-M6 partial-item remediation, CI and release blockers

The following **code-only subitems** were implemented on the draft
development branch, requiring current-commit CI verification:

- **M3-04:** versioned tenant SQL migration
  `20261111335000_chess_m3_document_lifecycle`, immutable
  `retentionUntil`, `legalHoldAt` and `suppressedAt` provenance,
  no direct metadata deletion, owner/admin + explicit write-grant
  lifecycle action route and client-service UI, short-lived
  READY-only download block if suppressed or retention expired.
  The original S3 object remains intact; hold release and deletion
  are not implemented or authorized.
- **M3-06:** manual, independently opted-in read-only PostgreSQL
  legacy-consent evidence inventory with verified TLS, explicit
  tenant allowlist and non-admin SELECT-only account, anonymous
  aggregate counts and failed-release status on anomalies. No
  historical record data is copied or manufactured.
- **M4-02:** optional employee delegated calendar OAuth gateway
  with selected task/appointment scopes, five-minute server nonce,
  verified tenant/account response, host-pinned HTTPS redirect,
  status/renew/revoke UI and cancellation-safe disconnect block.
  Real provider OAuth callback/PKCE/token custody is delegated to
  an independently certified gateway and remains unverified.
- **M5-02:** bounded bank feed pagination and fail-closed provider
  truncation and replay handling. The complete bounded snapshot
  must arrive before deduplicated UNMATCHED-only import is
  attempted. Actual Plaid delegated consent, webhooks and
  financial reconciliation remain external gates.
- **M6-04:** independent per-service regulated gateway API keys
  and positive service/partner/workflow response binding required
  for both create and status checks. All handoff execution remains
  disabled without explicit flags, current license/affiliation
  evidence and consent.

**No milestone has been promoted to production-complete.** The
backlog remains authoritative for external credentials, licensed
professional scope, two-tenant signed-in E2E, real S3 and financial
provider tests, legal e-signature, independent audits, retention,
disaster recovery and production release approval.
Read exact interface contracts and missing inputs at
`docs/CHESS_CORP_2_M3_M6_ROUND15_ACCEPTANCE.md`.


## Round 16 - Milestone 7 AI, billing, subscriptions and reports

**Development status:** Additional M7 engineering committed and checked
via ordinary GitHub CI; see the accepted commit run in the final
Round 16 report. The separately maintained release gates below
are NOT satisfied by local CI, placeholders or committed screens.

- **AI governance (M7-01/02):** prompt remains only metadata
  flags (status, due bucket, assignment boolean). The AI
  gateway is gated by independently approved DPA and per-call
  cost policy. Requests explicitly require no provider
  retention/tool calls and cap output tokens and claimed cost.
  Responses missing cost evidence or exceeding a bounded
  size are rejected. Tenant-local UTC daily call reservations
  atomically enforce a conservative upper call limit for both
  manual and scheduler triage. Failed calls consume quota.
  Employee AI UI displays capped call usage; no financial
  operation can be performed by advice.
- **Merchant billing (M7-03/04):** opaque, strict, HMAC-signed
  tenant-bound merchant event receipt for payment/refund and
  chargeback observations, with five-minute replay window,
  source invoice and amount checking, unique event ID,
  immutable PostgreSQL evidence and a restricted employee
  review table. Events are never marked SETTLED or PAID;
  no card/bank data is accepted, no GL/ACH/charge is triggered.
- **Recurring invoice plans (M7-04):** owner/admin creates an
  immutable-scope monthly schedule that requires a distinct
  approved administrator. An isolated, tenant-allowlisted,
  default-off scheduler creates only `DRAFT` invoice
  rows for an approved unit, current client consent and
  active signed-off staff service grants. Source hash and
  month-specific request keys are replay-safe. A lost
  grant/assignment or withdrawn client consent pauses the
  schedule, and every draft must separately pass the existing
  independent invoice approval and delivery checks.
- **Historical reporting (M7-05):** only completed UTC months
  may be frozen into immutable, checksum-bound operational
  snapshots, separately approved by another administrator.
  A dedicated JSON evidence view shows the original payload,
  never a recalculation from subsequently edited statuses.
  This is NOT financial statement consolidation, real
  revenue recognition or confirmed cash flow.
- **Provider/staging evidence (M7-06):** no real signed merchant
  payout, collected-cash settlement, automatic charge,
  refund execution, third-party e-file, statutory tax
  calculation or production accounting close has been tested
  or enabled. Real merchant/provider identities and legal
  approvals are still mandatory.

**Open criteria:** `docs/CHESS_CORP_2_ROUND11_OPEN_ITEMS.md`
(M7-01 through M7-06 remain marked EXTERNAL/BOTH);
`docs/CHESS_CORP_2_M7_ROUND16_ACCEPTANCE.md`.
Neither the draft PR nor any of the eight milestones is
production complete from development CI alone.


## Round 17 — Security, authenticated E2E, restore evidence and release review

**Recovered actual Round 16 head:** `fd227c84e62e22cd83d285476c234f6252c31bfd`;
both normal CI jobs completed successfully on GitHub Actions run
`43057238636`. Draft PR #24 remained open/unmerged.
This verified HEAD superseded the interrupted Round 16 response.

**Round 17 M8 engineering implemented (pending latest SHA CI until checked):**

- M8-03: Strict restored PostgreSQL `sslmode=verify-full`,
  isolated source/restore hosts, nonowner read-only role,
  immutable S3/KMS object-version checks, eight mandatory
  restored tenant tables, six active PostgreSQL immutability
  triggers, and separate known immutable security-event,
  purpose-bound consent and billable-invoice record witnesses.
  An explicitly approved isolated backup/restore acceptance
  workflow now exists.
- M8-04: Explicit two-tenant deployed SHA attestation and two
  separate machine credentials before ANY authenticated
  cross-tenant browser-session matrix runs. Expanded E2E checks
  for unauthorized merchant observations, frozen operational
  snapshots and cross-origin document lifecycle mutation.
  New protected `workflow_dispatch` acceptance workflow.
- M8-08: Read-only, token-only per-tenant incident health for
  stale worker, audit archive unresolved/rejected/old,
  appointment consent cancellation backlog and overdue
  recurring work. Independent on-call review and a different
  monitor secret are required. Unhealthy returns HTTP 503;
  real external paging escalation is not in place.
- M8-10: Protected deployed staging attestation expanded to
  require anonymous employee-route and unsigned machine
  callback denial with no-store/nosniff/frame restrictions.
  Staging validation still does not deploy, migrate or test
  a real vendor without approved credentials.
- New tests and CI checks cover DR policy and structural
  acceptance, authenticated E2E preconditions, staging
  security boundaries, and incident-health classification.

**Milestone 8 remains PARTIAL / RELEASE BLOCKED.** A green CI
check proves source compilation and fictional database tests,
not independent infrastructure DR, a real live deployment,
security penetration testing, endpoint provider certification,
signed on-call, staff privacy or regulatory approval.
All unresolved `M8-01`–`M8-12` remain in the open register.

Reference: `docs/CHESS_CORP_2_M8_ROUND17_ACCEPTANCE.md`.


## Round 20 - code-only reconciliation (draft PR, release still blocked)

Source-level enhancements: M4 overdue/appointment paged alert workers,
daily manager escalations for unassigned and undated blocked work,
M1/M8-09 serializable sensitive read auditing for regulated workflows and
bank review details, and an OFF-by-default M5 three-person bank review to
legacy double-entry ledger bridge. Actual posting is deliberately prohibited
until four separately approved flags are set; even then provider and
cross-database revocation/settlement testing are independently mandatory.

The original milestone summaries above are historical. For the exact
remaining external and engineering items, use
docs/CHESS_CORP_2_ROUND20_CODE_AUDIT.md and the append-only outstanding
items register. **No milestone's production-release gate is closed.**


### Round 20 final code-security additions

Operational-portfolio aggregates now use the same tenant-only,
serializable, immutable read-audit mechanism as regulated-workflow
and bank-review detail reads. M5 posting also refuses inactive or
incorrectly classified bank GL accounts. Source-level CI does not
remove outstanding multi-entity accounting, bank-settlement,
compliance or production authorization blockers.


## Round 21 - employee UI completeness review

Covered missing human-readable workflows: manual bank-review-to-GL
posting confirmation (disabled until separately approved), payroll
status and independently approved submission (certified-only),
owner-only archive/worker/incident oversight, and navigation discovery.
Preserved machine-only boundaries around webhooks, scanner callbacks,
audit archive delivery, scheduled workers and staging attestations.
CI green does not independently validate a real browser, payments,
regulated activities or a production security incident drill.

See docs/CHESS_CORP_2_ROUND21_UI_COVERAGE.md for the exact screen
inventory, access checks, activation placeholders and still-open gates.


## Round 23 - Milestones 3-7 code completion audit

Corrected interrupted Round 22 payroll reviewer TypeScript failure.
Added tenant-transaction source/consent/grant rechecks (M3),
PostgreSQL appointment cursor/backlog regression (M4), source-bound
payroll approval database uniqueness and audit provenance gates (M5),
strict tenant/business/case/partner receipt correlation (M6), and
bounded multi-page, DRAFT-only recurring invoice worker with degraded
overflow signal (M7).

Remaining roadmap items marked BOTH or EXTERNAL have **not** been
automatically closed. Vendor credentials, legal retention/e-signature,
consent cross-DB races, live provider settlement/filing, approved
licensing, statutory accounting close, production DR and external
authorization still block a finished build. Full details:
docs/CHESS_CORP_2_ROUND23_M3_M7_CODE_AUDIT.md.


## Round 25 — Codespaces fictional demo hardening (M1–M8 preview)

Added a versioned Node20 Codespaces environment (auto npm ci, port 3000),
stronger pre-migration PostgreSQL schema/registry isolation, shared
idempotent tenant registration+fixture seeding exercised by disposable
PostgreSQL integration, read-only post-setup verification, disabled
external service activation checks and accurate README browser steps.
No real Codespaces/Neon/Clerk test credentials were accessible for
sign-in, so live browser E2E is **EXTERNAL / NOT VERIFIED** rather than
complete. Reference
docs/CHESS_CORP_2_ROUND25_CODESPACES_ACCEPTANCE.md for exact evidence
and docs/CHESS_CORP_2_OWNER_SUPPLY_CHECKLIST.md (item 01) for the sole
external dependency. No production release gate status changes.
