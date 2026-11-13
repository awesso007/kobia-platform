# KOBIA.AI Platform

> Multi-tenant SaaS platform. Phase 1: AI-native accounting for accountants and the businesses they serve.
> **Launches Feb 15, 2027.**

[![CI](https://github.com/awesso007/kobia-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/awesso007/kobia-platform/actions/workflows/ci.yml)
[![License: Proprietary](https://img.shields.io/badge/License-Proprietary-red.svg)](#license)

---

## What is KOBIA

KOBIA is a multi-tenant SaaS platform that gives accountants, business owners, and the clients they serve a complete operating system to run their books, payroll, invoicing, and bill pay — with an AI layer that catches errors, reconciles transactions, and answers questions in natural language.

**Phase 1 wedge:** AI-native accounting that beats QuickBooks Online, Xero, Karbon, Bill.com, and Gusto on time-to-close, accuracy, and onboarding speed.

**Phase 2 (Year 2):** Tax preparation.
**Phase 3 (Year 3+):** Mortgage origination and real estate management.

---

## Tech Stack (locked)

| Layer | Choice | Why |
|---|---|---|
| Framework | [Next.js 14+](https://nextjs.org/) (App Router) | Server Components, edge runtime, best DX for SaaS |
| Language | TypeScript (strict) | End-to-end type safety |
| API | [tRPC](https://trpc.io/) | Zero-boilerplate typesafe APIs |
| ORM | [Prisma](https://www.prisma.io/) | Type-safe DB access, migrations |
| Database | [Neon Postgres](https://neon.tech/) | Serverless, branchable, scales free → enterprise |
| Auth | [Clerk](https://clerk.com/) | Multi-tenant ready, per-tenant subdomain login |
| Styling | [Tailwind CSS](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/) | Fast, accessible, customizable |
| Email | [Resend](https://resend.com/) | Modern transactional email API |
| Hosting | [Vercel](https://vercel.com/) | Native Next.js deploy, edge functions |
| Monitoring | [Sentry](https://sentry.io/) + [PostHog](https://posthog.com/) | Errors + product analytics |

---

## Multi-Tenant Architecture (Lock EEEE)

Each KOBIA tenant gets:

- **Their own subdomain:** `{tenant}.kobia.ai` (e.g., `figaccounting.kobia.ai`)
- **Separate employee login URL:** `{tenant}.kobia.ai/login`
- **Separate client portal URL:** `{tenant}.kobia.ai/portal`
- **Tenant-branded UI** — their logo, colors, fonts. KOBIA branding is invisible on all paid tiers above entry level.
- **Row-level data isolation** — every database table has a `tenantId` column, enforced at the ORM layer.

---

## CHESS Corporation milestone status and external inputs (Round 24)

The CHESS-specific services are **development code on draft PR #24**, not
a production-ready KOBIA release. For all eight milestones, the current
verified implementation-versus-release matrix is in
[the CHESS CORP 2 roadmap](docs/CHESS_CORP_2_ROADMAP.md).
For **one** owner action list, including environment variable names,
protected vendor credentials, legal approvals and the priority/order to
supply them, use the
[consolidated owner-supply checklist](docs/CHESS_CORP_2_OWNER_SUPPLY_CHECKLIST.md).
Technical flags-only examples (no secrets) are in
[CHESS external environment placeholders](docs/CHESS_CORP_2_ENV_PLACEHOLDERS.example).
Never enable real bank posting, payroll execution, payments, regulated
partner workflows or consent portals from a CI pass alone.

## CHESS CORP 2 Round 58 — transaction-coupled sensitive CRM reads

[Round 58 technical report](docs/CHESS_CORP_2_ROUND58_TRANSACTION_SENSITIVE_READS.md).
Continued and verified Round 57 CI before expanding sensitive SELECT
coverage: 71 historical CRM server-page query entrypoints across 13
modules, five project/task loaders and three telephony server-action
directory reads now use serializable tenant transactions. Every wide
read checks an ACTIVE principal, one historical business and all
per-client service read grants; SELECT and privacy-minimal immutable
audit are in the same COMMIT. Unsupported cross-client or multi-business
read authorization is deliberately blocked until safe migration.
PostgreSQL and source-gate regression coverage are included. Other
unreviewed direct database loaders, service integrations and protected
real-client staged approvals remain open. **Do not merge/deploy on
normal CI alone.**

## CHESS CORP 2 Round 55 — resumed machine API and cross-business review

Recovered and repaired interrupted Round 54 work; check [the Round 55
engineering report](docs/CHESS_CORP_2_ROUND55_PUBLIC_MACHINE_AUTHZ.md)
for commits, source and test scope. All 17 signed cron routes now
re-read the ACTIVE canonical tenant registry before selecting a
tenant schema. Five Twilio callbacks and the inbound mail relay
deny tenant-wide machine operations when legacy provider records cannot
be assigned to a single CHESS business. Inbound mail no longer
auto-links a spoofable From sender to a CRM client. Legacy Lead
directory, Kanban and server actions now verify live membership,
ownership, one-business assignment and audit in one serializable
transaction; multi-business rows are blocked pending businessId
migration. A new source-policy CI gate and regression tests protect
these boundaries.

Signed legacy email open/click tracking now uses distributed quotas and
transaction-coupled unsubscribe checks. Tracking cannot undo a
recipient's opt-out; a two-Prisma-client PostgreSQL regression covers
late/replayed tracking requests.

Prior Round 54 hardened signed unsubscribe, public e-signatures,
published KB feedback, webhook parsing and database replay controls.
Outbound marketing email requires an opaque recipient-owned unsubscribe
capability and a vault-supplied AES key; unsigned old links need a
human support replacement. Mail attachments are fail-closed until
scanned. All protections remain source-only; external provider,
legal, signed-in tenant staging, durable outbox and business-data
backfill/release gates remain open. **Never merge/deploy merely because
the CI run is green.**

## CHESS CORP 2 Round 53 — distributed booking and analytics protection

All three anonymous booking APIs and both public analytics POST APIs now
check active tenant registry, a shared PostgreSQL tenant/resource/visitor
rate limit, and a private trusted-IP HMAC. Booking submit additionally
requires Cloudflare Siteverify with a tenant/page-bound challenge action
and a visible one-time widget. Self-service management pages also use ACTIVE tenant and constant-time
manage-token checks. Reschedule booking now submits a fresh challenge
and will not claim success or create another replacement if cancellation
fails or the network outcome is uncertain. Booking cancellation retains the bearer
token and now commits booking/calendar state atomically. Public analytics
is telemetry only: no anonymous SITE_FORM_SUBMIT automation, no forged
F2 payment/submit success, only PUBLISHED site/form and matching
published page/form-owned step. F2 page VIEW is now metered on the client.

All five public paths fail closed until the existing Round 52 secrets
and approved trusted ingress are configured. Anonymous tracker calls
have no interactive CAPTCHA; edge bot controls, independent load and
hosted provider tests remain open. Report:
[Round 53 security](docs/CHESS_CORP_2_ROUND53_PUBLIC_SURFACE_SECURITY.md).

## CHESS CORP 2 Round 52 — distributed protection for public forms

Both public web-to-lead form APIs (legacy and Forms 2.0) now use an
ACTIVE tenant registry check, a bounded request body, privacy-keyed
PostgreSQL rate limits shared across server instances, and an exact
tenant/form action + hostname validated Turnstile Siteverify challenge
before inserting records. Process-local IP maps are removed. The public
form pages render a challenge widget and reset single-use tokens on
failed submission. Quota breaches return HTTP 429 with Retry-After 60.

**Disabled until explicitly configured and independently accepted.** Missing
secret/provider configuration or quota storage fails closed with no new
lead/submission. The existing tenant `ChessRequestRateWindow` migration must
be applied. Operator inputs (Cloudflare widget/secret, private rate HMAC,
trusted ingress header and approved hostnames) are in the owner-supply
checklist. Source gate, unit tests and independent-client PostgreSQL
concurrency regression run in CI. See
[Round 52 report](docs/CHESS_CORP_2_ROUND52_PUBLIC_FORM_ABUSE.md).
Booking, public analytics, unsubscribe and other machine callbacks
need separate abuse review; none is promoted to production.

## CHESS CORP 2 Round 51 — public booking tenant isolation and atomic reservations

Public booking slots, submit and cancellation now refuse inactive or unknown
registry tenants. A serializable tenant transaction binds slot recheck,
calendar ownership, event, attendee and booking so concurrent reservations
cannot silently double-book or leave a partial calendar event. External
notifications follow COMMIT. A disposable PostgreSQL contention test and
source gate run in CI. See [Round 51 report](docs/CHESS_CORP_2_ROUND51_PUBLIC_BOOKING.md).
This covers three public booking routes, **not** all public/machine callbacks.
Protected provider, privacy, browser, abuse/load and release gates remain open.

## CHESS CORP 2 Round 50 — atomic historical GET and tRPC SELECT auditing

Round 50 moves the 39 formerly response-only audited historical
tenant GETs and the read-only search POST into an isolated
**serializable SELECT + live-membership + audit-event transaction**.
It also makes the one historical protected tRPC GET route atomic
using the separate legacy-ledger Prisma transaction and read-only
router selector, including its bank-reconciliation helper queries.
Two sensitive client-profile GETs retain their existing more
specific transaction-coupled source/grant audits.

New regression tests and CI guards cover the entire 42-GET
historical inventory, transaction mismatches, revoked membership,
no-audit/no-data, concurrent request scope, forbidden tRPC writes,
and a disposable PostgreSQL transaction rollback. No live
financial or vendor requests are made.

**Not a production release approval:** separate public tokens,
provider webhooks, service/business-specific authorization,
source-helper bypass review, immutable external audit receipts,
Clerk browser and two-tenant race acceptance are still open.
Review [Round 50 report](docs/CHESS_CORP_2_ROUND50_TRANSACTIONAL_SENSITIVE_READS.md),
[roadmap](docs/CHESS_CORP_2_ROADMAP.md) and
[owner checklist](docs/CHESS_CORP_2_OWNER_SUPPLY_CHECKLIST.md).
Draft PR #24 only; production main stays unchanged.

## CHESS CORP 2 Round 49 — tenant-scoped historical API mutations

Round 49 works against the historical 111-file authenticated-read
inventory and its non-GET methods. It tightens explicit tenant
module selection (live Clerk + active tenant membership), refuses
LOCAL file writes without same-origin, current uploader ownership,
exact tenant key and bounded bytes, and enforces nested ancestry
for form fields/steps, sites/pages/blocks/domains, and workflow
run cancellation. PRIVATE and DM chat channels now require
membership before GET, POST, reaction, pin, read-mark, edit or
delete; only public channels may auto-join on send. DM recipients
must be ACTIVE. Feed follows now check permission before shared
handler invocation.

The new method-admission CI source gate enumerates all classified
historical mutation methods and rejects missing authorization or
reviewed resource guards. Its unit tests cover negative and
positive scope decisions. **No actual signed-in browser
acceptance is claimed**, no external credential or live
integration was enabled, and other legacy methods still need
transaction-coupled per-business authorization, CSRF policy,
audit/consent coupling and independent security acceptance.
See [Round 49 security report](docs/CHESS_CORP_2_ROUND49_AUTHENTICATED_MUTATIONS.md),
[milestones](docs/CHESS_CORP_2_ROADMAP.md) and
[owner acceptance checklist](docs/CHESS_CORP_2_OWNER_SUPPLY_CHECKLIST.md).
Draft PR #24 remains unmerged; production unchanged.

## CHESS CORP 2 Round 48 — historical public and machine API protections

Round 48 makes selected unsafe legacy public and machine endpoints fail
closed or require verifiable signed capabilities. The Forms 2.0 payment
initiation route can no longer fake `PAID`; two replay-unsafe Stripe
legacy webhooks are quarantined; email relay and Twilio callbacks now
require strict active tenant resolution, and Twilio provisioning and
voicemail URLs include signed tenant selectors. Booking cancellation
uses an opaque 18-byte token and conditional idempotent transition.
Open/click email tracking requires server-minted expiring HMAC tokens:
unsigned clicks fail, unsigned pixels are inert.

A new historical-method CI inventory/source drift gate and black-box
default-deny HTTP smoke extend the prior Round 37/43 and Round 47 tests.
**This is a bounded security improvement, not a full historical sensitive
SELECT and mutation-authorization review.** Provider sandbox acceptance,
distributed public-form abuse controls, immutable audit and replay-safe
billing replacement remain open. New secrets are in the owner checklist
as names-only vault inputs, never committed values.

See [Round 48 security audit](docs/CHESS_CORP_2_ROUND48_HISTORICAL_API_SECURITY.md),
[authoritative milestones](docs/CHESS_CORP_2_ROADMAP.md) and
[owner supply](docs/CHESS_CORP_2_OWNER_SUPPLY_CHECKLIST.md).
Development branch / draft PR only; main and production untouched.
Eight production milestones remain blocked, zero independently signed.

## CHESS CORP 2 Round 47 — fail-closed legacy machine cron authentication

All **17** `vercel.json` /api/cron handlers now refuse requests without
the exact server-only `Authorization: Bearer <CRON_SECRET>` credential.
No configured secret or a key under 32 bytes returns HTTP 503; wrong or
missing bearer returns 401. The check occurs before tenant iteration or
side effects. The new ordinary-CI source drift gate rejects unguarded
scheduled cron GET methods and the Vitest suite checks negative/positive
machine-auth behavior. This hardening applies **only** to the 17 legacy
scheduled endpoints, not all 26 historical machine callbacks.

To exercise this in a *separate protected staging project*, the owner must
supply an independently generated high-entropy `CRON_SECRET` in server
environment settings and arrange actual Vercel-scheduler and replay/race
acceptance with monitored operator evidence. **Do not** set it in Git or
the fictional demo; missing secret intentionally disables scheduling.
The full historical API security and third-party reviews remain open.
See [Round 47 audit](docs/CHESS_CORP_2_ROUND47_CRON_AUTH.md),
[milestone matrix](docs/CHESS_CORP_2_ROADMAP.md) and
[owner checklist](docs/CHESS_CORP_2_OWNER_SUPPLY_CHECKLIST.md).
Draft PR #24 stays unmerged, main and production unchanged; 8/8
production milestones remain blocked.

## CHESS CORP 2 Round 46 — additional employee and client fictional-demo browser workflows

Recovered Round 45 final SHA
`b6b41f590292c4b8335c092f82afe0cb666c1b29`: normal CI run
[43306304711](https://github.com/awesso007/kobia-platform/actions/runs/43306304711)
passed **all 3 jobs**; the interrupted response did not leave uncommitted
or failing Round 45 work.

Round 46 adds `e2e/chess-demo-round46.spec.mjs` to the existing
**manually dispatched, protected `chess-demo-e2e` Playwright
Chromium suite**. Its six signed-in owner/employee/client tests exercise
the eight-business demo tour and accounting task, employee two-browser-tab
409 stale update recovery, foreign mortgage task POST/PATCH rejection,
verified client PENDING disclosure and document isolation, separate
work-item/appointment calendar consent round trip with OFF cleanup, and
mobile employee/client serious/critical axe accessibility checks.

The normal build CI **syntax-checks and source-policy-gates** the new
test source; it does **not** actually run Clerk browser tests. Disposable
`chess_demo_ci` PostgreSQL fixture tests additionally assert all five
client profiles' two business links, zero grants/documents/regulated
cases, PENDING unsigned disclosures, and rejection of an
unauthorized GRANTED transition. Manual protected browser execution
requires three distinct verified Clerk TEST identities, an isolated
non-pooled Neon `chess_demo` database, and independent review of actual
Playwright traces; those results are **not yet verified**.

No real provider, payment, consent acceptance, regulated workflow,
production merge or deploy is enabled. See
[Round 46 browser-test matrix](docs/CHESS_CORP_2_ROUND46_EMPLOYEE_CLIENT_BROWSER_E2E.md),
[authoritative roadmap](docs/CHESS_CORP_2_ROADMAP.md),
[names-only config placeholders](docs/CHESS_CORP_2_ENV_PLACEHOLDERS.example)
and the [owner checklist](docs/CHESS_CORP_2_OWNER_SUPPLY_CHECKLIST.md).
Draft PR #24 remains unmerged. Production gates remain 8/8 blocked.

## CHESS CORP 2 Round 45 — immutable document lifecycle, audited redaction review and safe disposal

M3 now adds a PostgreSQL trigger migration preventing replacements and
redacted derivatives from dropping inherited **retention dates, legal
holds or download suppression**; later changes to an original propagate
through the revision chain. Real disposable-PostgreSQL regression tests
verify these inheritance and anti-shorten rules.

Private uploads now distinguish missing S3 HEAD from timeout/403;
confirmation requires exactly one pinned content version and a current
employee write grant/verified client consent in an atomic audited
transition. Malware callbacks are single-use, reject extra S3 versions
and audit invalid metadata. A clean-scanned REDACTED version remains
quarantined until a different owner/admin securely inspects the exact
pinned bytes through a SHA-256 checked proxy, records a post-scan
review event and explicitly attests before publication; the original
remains retained as evidence. The employee screen provides an
independent UNKNOWN deletion **read-only reconciliation** action
without rerunning DeleteObject and fixes same-origin download links.

**Physical deletion, hold release, externally witnessed byte erasure,
Object Lock/WORM and production scanner/provider acceptance remain
BLOCKED.** This code cannot prove all replicas and backups were erased;
all private S3, scan, lifecycle and purge feature gates remain OFF.
See the [Round 45 lifecycle audit](docs/CHESS_CORP_2_ROUND45_DOCUMENT_LIFECYCLE_AUDIT.md),
[authoritative M1–M8 matrix](docs/CHESS_CORP_2_ROADMAP.md) and
[canonical owner checklist](docs/CHESS_CORP_2_OWNER_SUPPLY_CHECKLIST.md).
No merge, production write or deployment was performed.

## CHESS CORP 2 Round 44 — durable distributed financial fault tests

The `chess-db-integration` workflow executes **14** dual-database
PostgreSQL failure scenarios: the original Round 38 six plus **eight
new Round 44 cases** for lost reservation ACKs, concurrent GL attempts,
wrong idempotency fingerprints, partial bank-claim rollback, deactivated
accounts, reconciliation timeouts, concurrent receipts and source-reference
replays. Assertions check exactly one journal, atomic ledger/bank rollback,
pinned receipt identity, no automatic UNKNOWN retry and no premature consent
withdrawal.

The fixture uses `chess_ci` and a separate temporary
`chess_finance_fault_ci` database on **one** GitHub CI PostgreSQL service.
`RUN_CHESS_DISTRIBUTED_DB_INTEGRATION` and
`CHESS_FAULT_LEGACY_DATABASE_URL` are CI-only; live posting and independent
financial outcome resolution stay **OFF**. These tests do not access
a real bank, prove independent physical-cluster failure, or settle money.
Protected sandbox credentials and legal/finance approval remain on the
existing [owner checklist](docs/CHESS_CORP_2_OWNER_SUPPLY_CHECKLIST.md).
See the [Round 44 14-case fault matrix](docs/CHESS_CORP_2_ROUND44_FINANCIAL_FAULT_MATRIX.md)
and [M1–M8 roadmap](docs/CHESS_CORP_2_ROADMAP.md).
PR #24 remains draft and `main` unchanged; no rollout.

## CHESS CORP 2 Round 43 — bounded historical API sensitive-read audit

The historical 162-file KOBIA API inventory now has a separate source CI
gate for **41 authenticated GET route response** audit wrappers and the
protected legacy tRPC query dispatcher (42 guarded read surfaces total),
plus the read-only search POST. A successful private GET is withheld
until a fresh live tenant-membership check and privacy-minimal
SERIALIZABLE audit commit succeed; audit failure returns generic 503,
not sensitive bytes. Protected tRPC queries recheck legacy membership
and pin a legacy `AuditLog` before returning. The old tRPC implicit
`demo` tenant fallback is removed.

**Important limitation:** This is audit-before-release, not proof that
an arbitrary legacy SELECT ran in the same transaction. Remaining
**69 non-GET historical route files**, 9 public capability endpoints
and 26 machine callback paths need method-specific review and acceptance.
The inventory is **not** an all-sensitive-read certificate; legacy
`AuditLog` is also **not** a WORM archive. All remaining code-only
route audit work and real authenticated staging/security evidence remain
outstanding, so do not enable production release.

See [Round 43 exact scope and gaps](docs/CHESS_CORP_2_ROUND43_HISTORICAL_SENSITIVE_READ_AUDIT.md),
[authoritative milestone matrix](docs/CHESS_CORP_2_ROADMAP.md), and
[the consolidated owner checklist](docs/CHESS_CORP_2_OWNER_SUPPLY_CHECKLIST.md).
Draft PR #24 remains unmerged, no deployment or provider flag is enabled.

## CHESS CORP 2 Round 41 — safe recovery of ambiguous outcomes

Round 41 also closes a bounded employee work-item gap: task lists now
commit an audited allow/deny decision with current role, business and
assignment checks in one SERIALIZABLE read transaction; task creation
and transitions repeat live authorization and assignment checks in their
audited write transactions. This is NOT a complete audit of older KOBIA
API routes.

Round 41 adds **independent, default-OFF** resolution of ambiguous
document deletion and bank journal posting. The S3 disposal path verifies
the exact pinned object version and enumerates all content versions before
and after deletion. On an UNKNOWN outcome a third owner/admin may only
inspect exact VersionId absence and pin a verified receipt; the code never
reissues a DELETE. The private S3 bucket must support
`s3:ListBucketVersions`, Object Lock/legal holds, approved KMS/IAM and
independently witnessed backup/erasure evidence. No physical deletion
is enabled by these changes.

Bank posting UNKNOWN and stale EXECUTING outcomes can only be reconciled
by a **fourth independent person** using an existing balanced and posted
ledger journal. A matching GL entry without a durable COMMITTED tenant
receipt no longer permits the original executor to claim replay success.
New release switches `CHESS_BANK_OUTCOME_RESOLUTION_ENABLED=false` and
`CHESS_BANK_OUTCOME_POLICY_APPROVED=false` stay OFF. The workflow never
posts a journal, retries an UNPOSTED/ambiguous result, or calls a bank
transaction settled. Source-only tests do not prove external acceptance.

See [Round 41 code-gap audit](docs/CHESS_CORP_2_ROUND41_CODE_GAP_AUDIT.md),
[the current M1–M8 matrix](docs/CHESS_CORP_2_ROADMAP.md) and
[the one owner-supply checklist](docs/CHESS_CORP_2_OWNER_SUPPLY_CHECKLIST.md).
Many historical sensitive-read routes and other code-only/security and
external acceptance items remain unverified; PR #24 stays draft,
unmerged, with `main` and production unchanged.

## CHESS CORP 2 Round 40 — fictional employee/client workflow acceptance

Round 40 extends the **manual, protected** `chess-demo-e2e` Playwright
browser suite with employee cross-business deep-link denial, stale task
HTTP 409 concurrency, manager-versus-SUPPORT permissions, client private
document/task denials and independent simultaneous owner/employee/client
Clerk TEST sessions. The demo setup still uses only the isolated fictional
Neon `chess_demo` tenant and never creates valid client service consent
or connects to any bank/provider. Normal CI tests browser-suite source
policy, syntax and seeded PostgreSQL task/consent integrity, not the
real authenticated browser. See the
[Round 40 E2E matrix](docs/CHESS_CORP_2_ROUND40_DEMO_EMPLOYEE_CLIENT_E2E.md)
and [protected demo workflow](.github/workflows/chess-demo-browser-e2e.yml).

Round 39 also added document revision/redaction/disposal source. It is
default OFF pending approved legal retention, S3 object-version deletion,
WORM evidence and separately configured `CHESS_DOCUMENT_PURGE_WORKER_TOKEN`
and release gates. The recovered Round 39 build regressions were repaired.
No production deletion, bank posting, or customer onboarding is enabled.

## CHESS CORP 2 Round 38 — distributed financial fault simulation

The source-only CI test `distributed-financial-outcome-round38.integration.test.ts`
uses two **independent disposable PostgreSQL databases** within GitHub's
isolated test service: a CHESS tenant schema and a separate legacy KOBIA
ledger. The tests inject lost acknowledgments, pre-commit timeouts, a
closed-period rollback, an interrupted CHESS receipt write, concurrent
duplicate attempts and consent withdrawal. They verify that ambiguous
`EXECUTING/UNKNOWN` bank-classification outcomes do not automatically
repost a journal or allow consent withdrawal; verified ledger receipts
are pinned idempotently. Nothing is posted to any real bank.

Use `RUN_CHESS_DISTRIBUTED_DB_INTEGRATION=1` **only with isolated CI**
and a distinct test-only `CHESS_FAULT_LEGACY_DATABASE_URL`. The normal
`chess-db-integration` GitHub Actions job provisions these test databases
and runs the suite. All CHESS financial execution flags are OFF by default.
See [Round 38 fault matrix](docs/CHESS_CORP_2_ROUND38_FINANCIAL_FAULT_AUDIT.md).
Actual independent provider outages, immutable receipts, protected
two-tenant identity tests, independent `UNKNOWN` resolution, recovery
and licensed/finance approvals remain open. Draft PR #24 must stay unmerged;
production `main` is unchanged.

## CHESS CORP 2 Round 37 — historical sensitive-read hardening

On draft PR #24, selected legacy KOBIA accounting exports, mail, document,
file-share/local-storage, form-submission and workflow-run reads now require
more explicit authorization and privacy-minimal read auditing. LOCAL fallback
downloads need a **protected server-only** `KOBIA_LOCAL_DOWNLOAD_SIGNING_KEY`
of at least 32 bytes; missing keys fail closed. Do not use LOCAL fallback for
real customer document storage.

The old helpdesk portal that granted a session solely from a matching email
address is deliberately disabled until verified email challenges or an
approved identity gateway are implemented. Other KOBIA client portal flows
are separate.

See [Round 37 source review](docs/CHESS_CORP_2_ROUND37_HISTORICAL_READ_AUDIT.md)
and the [162-route historical API inventory](docs/CHESS_CORP_2_ROUND37_HISTORICAL_ROUTES.json).
Normal `npm test` checks that newly added historical API routes are
classified. The inventory and code-marker tests **do not prove complete
sensitive-read coverage or authorize deployment**. All unreconciled routes,
staging tests, licensed workflows, external WORM and DR approval remain
pending. Production `main` is unchanged.

## CHESS / KOBIA legacy taxpayer export hardening — Round 36

The development branch now restricts legacy KOBIA 1099-NEC and 1099-MISC
CSV downloads containing taxpayer IDs to current OWNER/ADMIN/ACCOUNTANT
memberships in an active tenant and entity, with a transaction-coupled
legacy read audit. This does **not** enable tax filing, provide immutable
WORM evidence or certify historic routes. See
[Round 36 security audit](docs/CHESS_CORP_2_ROUND36_LEGACY_TAX_EXPORT_AUDIT.md)
and the [current M1–M8 matrix](docs/CHESS_CORP_2_ROADMAP.md).
Production main remains unchanged; draft PR #24 is not approved for merge.

## CHESS employee service desk — Round 27

Within the isolated CHESS tenant, sign in using an active staff
membership, open /app/overview, then select **CHESS service desk**
to navigate to /app/chess-desk. Only OWNER/ADMIN roles see the
supervisor finance, regulated, billing, reporting and security links;
every destination rechecks server permissions independently.

Business Units displays revoked client-service-grant counts after
staff offboarding. Service Billing shows the most recent draft
worker inspection, not invoice delivery. Approved financial case
reviews offer **read-only** bank/journal reconciliation.
See [Round 27 UI inventory](docs/CHESS_CORP_2_ROUND27_EMPLOYEE_UI.md)
for all M1–M8 screens, machine-only exclusions and acceptance gates.
Real Clerk/Codespaces acceptance and external approvals are still
required before any production release.

## CHESS Corporation fictional demo — Round 25 Codespaces setup

**Sandbox-only:** CHESS is an isolated fictional tenant of the independent
KOBIA platform. Stay on **feature/operations-overview**, draft PR #24.
Do not merge to main, reuse a production Neon connection, copy customer
information, activate licensed/financial integrations, or deploy production.

### Prerequisites (one-time setup)

1. On GitHub > **Code > Codespaces > New with options**, choose branch
   **feature/operations-overview** and create a fresh Codespace.
   Verify with `git branch --show-current`. The new
   `.devcontainer/devcontainer.json` configures **Node 20**, runs
   `npm ci --include=optional` **automatically** on creation,
   and forwards port **3000**. If reusing an old Codespace, **Rebuild
   Container** to apply this config; run `npm ci` manually only
   if automatic installation did not succeed.
2. In Neon, create a **separate empty sandbox database** named exactly
   `chess_demo`, and copy a **non-pooled** PostgreSQL URL at
   `*.neon.tech` with `sslmode=require`; never
   paste its password in chat or issues. In Clerk, use a **development/test**
   instance with `pk_test_`/`sk_test_` keys, and
   create a **verified primary-email** test user. Do not use a live instance.
3. Inside the Codespace terminal: `cp .env.example .env.local`
   and edit the **untracked** file. Supply these exact values:

   | .env.local variable | Sandbox-only value |
   | --- | --- |
   | `DATABASE_URL` | Empty, non-pooled Neon `chess_demo` database with TLS `sslmode=require` |
   | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk development `pk_test_...` |
   | `CLERK_SECRET_KEY` | Clerk development `sk_test_...` |
   | `CHESS_DEMO_OWNER_EMAIL` | Exact **verified primary email** of that Clerk TEST user |
   | `NODE_ENV` | `development` |
   | `CHESS_DEMO_MODE` | `true` |
   | `NEXT_PUBLIC_DEFAULT_TENANT` | `chess-demo` |
   | `NEXT_PUBLIC_ROOT_DOMAIN` | `kobia.ai` (the preview uses path-based routing) |
   | `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/chess-demo/login` (override the old `/login`) |
   | `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | `/app/overview` (override the old `/dashboard`) |
   | `NEXT_PUBLIC_APP_URL` and `CHESS_PUBLIC_ORIGIN` | **Exact forwarded HTTPS port 3000 origin** `https://<codespace>-3000.app.github.dev` for browser testing. For localhost-only testing use matching `http://localhost:3000` |

   Add the **exact** Codespaces preview origin to Clerk's development
   redirect/allowed-origins settings and confirm the port is accessible
   only to the intended test users. `DIRECT_URL` should be
   omitted (or identical to the non-pooled demo `DATABASE_URL`).
   Leave **every external feature/worker/provider approval flag** absent
   or `false`; the setup deliberately refuses any activated
   financial, licensed, AI, billing, scheduling, consent-portal or other
   outbound-service execution. The default example provides no live keys.
   If the preview origin changes, update the two app origins and Clerk
   settings, then restart Next.js.

### The one setup command

Run only **`npm run demo:setup`** after the prerequisites.
It validates the test keys, Node environment, exact Neon DB and tenant,
checks the database *before any DDL*, deploys the platform schema and the
isolated `tenant_chess_demo` migrations, registers one DEMO
tenant, and seeds **8 fictional CHESS business units, 3 staff, 5 fictional
clients, 8 CHESS work items, 4 ordinary CRM tasks and 5 PENDING
disclosures**. It does **not** grant a client service, accept consent,
create licensed credentials, transmit payroll, or post financial journals.

A second run on the same untouched fictional sandbox must not duplicate
records or upgrade existing/revoked staff access. It fails closed if fixtures
are inconsistent. For a **read-only database verification** after setup,
run `npm run demo:verify`; it should report PASS, the exact
demo tenant and fixture counts, without creating or modifying rows.

### Browser acceptance (real credentials and a real Codespace required)

4. Start the development server with `npm run dev -- -H 0.0.0.0`
   and open the **forwarded port 3000** HTTPS URL in the browser.
   Open `/chess-demo/login` and sign in using the verified
   Clerk development user matching `CHESS_DEMO_OWNER_EMAIL`.
   The first successful request to `/app/overview` may
   register *only this verified user's* new demo OWNER membership;
   a suspended or preexisting low-privilege account is **never promoted**.
5. Verify the **FICTIONAL DEMO** banner and click **Guided demo tour**
   at `/app/demo`. It must display **8 business units,
   3 fictional employees and 5 fictional profiles**, plus eight service
   cards and sample task counts. Open the work items and client directory
   via the demo links. Financial and licensed service-case queues may be
   empty by design: **PENDING consent grants no service-case access**.
6. In an unauthenticated/private browsing session, requesting
   `/app/demo` must not return client records.
   A different Clerk user not matching the allowlisted email cannot
   claim a demo OWNER membership. Verify that the service-grant
   count is **0**, all five disclosures are **PENDING**, and no bank,
   payroll, merchant, tax filing or licensed-partner operation occurred.
   Re-run `npm run demo:verify` for read-only database
   integrity after the browser tour.

**Precisely what is and is not verified:** The default GitHub Actions CI
runs actual isolated PostgreSQL platform+tenant migrations, tenant
registration, repeatable fictional seed, read-only verification, and
unrelated-schema/tenant refusal tests. CI also checks build, lint, types,
unit tests and security smoke. **CI does NOT run an actual hosted Codespace
with your Neon/Clerk test credentials or click through a real signed-in
Clerk browser.** That final acceptance requires the test resources in
[owner-supply checklist item 01](docs/CHESS_CORP_2_OWNER_SUPPLY_CHECKLIST.md).
Record the Codespace URL, date, redacted test-owner identity and screenshots
in the private staging acceptance record—never credentials or customer data.

See [Round 25 acceptance matrix](docs/CHESS_CORP_2_ROUND25_CODESPACES_ACCEPTANCE.md)
and [the earlier demo design](docs/CHESS_CORP_2_ROUND18_DEMO.md).

---

### Automated signed-in browser and accessibility acceptance (Round 28)

The browser suite is deliberately separate from normal CI because it needs a
real **Clerk development/test instance** and the isolated Neon
\`chess_demo\` database. Create three distinct verified primary-email Clerk
test users: owner, employee and client. The Playwright sign-in-token helper
does not complete MFA or additional session tasks, so the employee and client
test users must not require either.

Set these optional values in untracked \`.env.local\` **before**
\`npm run demo:setup\`:

- \`CHESS_DEMO_EMPLOYEE_EMAIL\`: the verified employee test user's primary email.
  The first successful employee visit to \`/app/overview\` may create only a
  new MEMBER membership and one SUPPORT assignment in the fictional
  Bookkeeping unit. Existing roles, suspended memberships and revoked
  assignments are never promoted or restored.
- \`CHESS_DEMO_CLIENT_EMAIL\`: the verified client test user's primary email.
  The first fictional client profile is mapped to this email during demo
  seeding. \`/chess-demo/client\` is a read-only view of that client's own
  PENDING fictional disclosure. It has no accept/withdraw controls and does
  not activate the separately gated client consent portal.

Install the pinned browser-only tools on demand (they are not KOBIA runtime
dependencies), install Chromium, then run the suite:

\`\`\`bash
npm install --no-save --package-lock=false --ignore-scripts \\
  @playwright/test@1.65.0 @clerk/testing@1.14.11 @axe-core/playwright@4.14.0
npx playwright install chromium
npm run test:e2e
\`\`\`

The suite uses Clerk's Playwright testing token and server-side sign-in helper.
It checks employee overview/service-desk/work-item access, client-only profile
and pending-disclosure visibility, cross-role denial, and axe-core WCAG 2.1 A/AA
automated scans for serious/critical violations. Automated scans do not replace
manual keyboard, screen-reader, responsive, independent accessibility or
security acceptance.

For GitHub Actions, configure the protected \`chess-demo-e2e\` environment with
the three secrets \`DATABASE_URL\` (non-pooled Neon \`chess_demo\`),
\`CLERK_PUBLISHABLE_KEY\` (\`pk_test_\`) and \`CLERK_SECRET_KEY\` (\`sk_test_\`),
plus the three email variables \`CHESS_DEMO_OWNER_EMAIL\`,
\`CHESS_DEMO_EMPLOYEE_EMAIL\` and \`CHESS_DEMO_CLIENT_EMAIL\`. Manually run
\`.github/workflows/chess-demo-browser-e2e.yml\` from
\`feature/operations-overview\` and confirm the isolated-demo checkbox. The
workflow revalidates the database and keys, runs the one-command demo setup,
verifies the fixtures, starts a local development server and runs the browser
suite. It never merges or deploys. Keep all financial, consent, calendar,
licensed-provider, AI and outbound-service switches OFF.

### Round 30: signed-in acceptance journeys and server-side demo guards

The [Round 30 browser acceptance matrix](docs/CHESS_CORP_2_ROUND30_BROWSER_ACCEPTANCE.md)
documents twelve Clerk/Playwright tests covering the fictional owner tour,
employee service desk and task-state persistence, denied other-business access,
client pending-disclosure privacy, employee/client role boundaries and
axe-core accessibility scans. These use **real verified Clerk development users**
with a dedicated fictional Neon `chess_demo` database, not mocked sessions.

For local acceptance use `npm run demo:setup`, `npm run demo:verify`,
install the pinned browser dependencies listed above, then run
`npm run test:e2e` with **port 3000 free**. The Playwright runner refuses
live Clerk keys, remote URLs, non-demo databases and enabled external providers.
If the server is already running, stop it first; the acceptance runner will
not silently attach to an arbitrary local service.

Normal CI syntax-checks these tests and runs fail-closed policy regressions.
It **does not execute authenticated browsers** without the protected Clerk
identities and isolated Neon credentials in owner-supply checklist item 01.
The manual workflow is a prepared acceptance path; dispatch availability
may require an explicitly approved GitHub workflow registration on the
default branch. Do not change `main` just to enable test execution.
Client consent acceptance is server-gated and impossible in fictional demo
mode, even through a direct API request.

## Getting Started

### Option A — Legacy KOBIA development on main (NOT the CHESS demo)

1. Go to [github.com/awesso007/kobia-platform](https://github.com/awesso007/kobia-platform)
2. Click the green **"Code"** button → **"Codespaces"** tab → **"Create codespace on main"**
   **Do not use these legacy steps for the CHESS demo. Use Round 19 above.**
3. Wait ~2 minutes for the environment to spin up
4. In the Codespace terminal, run:
   ```bash
   cp .env.example .env.local
   npm install
   # Only for a disposable local DB; never run db:push on production.
   npm run db:push
   npm run dev
   ```
5. Open the forwarded port URL (Codespaces will show a popup). You'll see KOBIA running.

### Option B — Local development

Requirements: Node.js 20+, npm, git, Postgres (or use Neon connection string)

```bash
git clone https://github.com/awesso007/kobia-platform.git
cd kobia-platform
cp .env.example .env.local
# Edit .env.local with your secrets
npm install
npm run db:push
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Environment Variables

Copy `.env.example` to `.env.local` and fill in:

| Variable | Where to get it | Required? |
|---|---|---|
| `DATABASE_URL` | [neon.tech](https://neon.tech/) → create project → copy connection string | Yes |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | [clerk.com](https://clerk.com/) → API keys | Yes |
| `CLERK_SECRET_KEY` | [clerk.com](https://clerk.com/) → API keys | Yes |
| `RESEND_API_KEY` | [resend.com](https://resend.com/) → API keys | Optional (Cycle 2) |
| `SENTRY_DSN` | [sentry.io](https://sentry.io/) → project settings | Optional (Cycle 3) |

---

## Project Structure

```
kobia-platform/
├── prisma/
│   └── schema.prisma           # Multi-tenant DB schema
├── src/
│   ├── app/
│   │   ├── [tenant]/           # Per-tenant routes (Lock EEEE)
│   │   │   ├── login/          # Tenant-branded login
│   │   │   ├── dashboard/      # Role-aware home (Lock HHH)
│   │   │   ├── books/          # Bookkeeping module shell
│   │   │   ├── payroll/        # Payroll module shell
│   │   │   ├── invoicing/      # AR/invoicing shell
│   │   │   ├── bills/          # AP/bill pay shell
│   │   │   └── settings/       # Tenant settings (branding, users)
│   │   └── api/trpc/[trpc]/    # tRPC API handler
│   ├── server/
│   │   ├── trpc.ts             # tRPC setup with tenant context
│   │   └── routers/            # API routers per module
│   ├── lib/
│   │   ├── db.ts               # Prisma client
│   │   ├── auth.ts             # Clerk integration
│   │   └── tenant.ts           # Tenant resolution from subdomain
│   └── components/
│       ├── ui/                 # shadcn/ui components
│       ├── branding/           # PoweredByKobia (Lock EEEE)
│       └── layout/             # Sidebar, header, nav
├── .github/workflows/
│   └── ci.yml                  # Lint + typecheck + test on push
└── docs/
    ├── ARCHITECTURE.md
    ├── CYCLE_1_SCOPE.md
    └── LOCKS_REFERENCE.md
```

---

## Cycles

- **Cycle 1 (Weeks 1-6, May-Jun 2026):** Foundation — this scaffold
- **Cycle 2 (Weeks 7-12, Jul-Aug 2026):** Core books + FIG as first internal tenant
- **Cycle 3 (Weeks 13-18, Sep-Oct 2026):** Payroll multi-state
- **Cycle 4 (Weeks 19-24, Nov-Dec 2026):** Invoicing + AP
- **Cycle 5 (Weeks 25-30, Jan 2027):** AI layer + QBO migration
- **Cycle 6 (Weeks 31-36, Feb 2027):** Launch hardening — public Feb 15, 2027

See `docs/CYCLE_1_SCOPE.md` for current cycle.

---

## License

Proprietary. © 2026 KOBIA.AI. All rights reserved. Not open source.

---

## Founder Notes

Maintained by Wilfred ([@awesso007](https://github.com/awesso007)) with AI agent assistance.
Roadmap: 226 locked decisions across 83 named Locks (A through FFFF), v5.2.3.
