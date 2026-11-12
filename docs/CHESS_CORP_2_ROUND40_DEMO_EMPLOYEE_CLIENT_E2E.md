# CHESS CORP 2 — Round 40 employee and client fictional demo workflow tests

**Repository:** `awesso007/kobia-platform`  
**Working branch:** `feature/operations-overview`  
**Pull request:** [draft #24](https://github.com/awesso007/kobia-platform/pull/24)  
**Production:** no merge or deployment to `main` / `kobia-platform.vercel.app`.

KOBIA is an independent multi-tenant business platform. CHESS Corporation
is a first tenant; these tests must not merge the businesses' separately
licensed operations or suggest services are live.

## Recovered Round 39 work

Round 39 was interrupted at commit
`bff5406fea1e85fe2b515a9e6075c7433492b820`.
The initial GitHub Actions run
[#43283822663](https://github.com/awesso007/kobia-platform/actions/runs/43283822663)
failed its build job (both PostgreSQL jobs succeeded). Subsequent fixes
serialize newly added revision timestamps in finance/regulated employee
screens and restore the existing safe download revocation warning that
the UI source regression test expects. Round 39 document retention,
redaction and purge are still **default OFF** and require external counsel,
storage and independent audit evidence.

## Round 40 browser workflow acceptance matrix

**Added:** `e2e/chess-demo-employee-client.spec.mjs`; registered in
`playwright.config.mjs` beside the existing CHESS demo browser tests.

| Browser workflow | Actions exercised | Expected evidence |
| --- | --- | --- |
| Employee cross-business deep link | Actual Clerk TEST employee login, obtain foreign opaque business ID from separate authenticated OWNER browser context, navigate to unsupported business work queue, then return to assigned bookkeeping queue | No automatic business fallback, no foreign work items, no manager controls; foreign GET returns 403; assigned work remains available |
| Employee optimistic concurrency | Read real fictional task + timestamp, send stale PATCH with old expectedUpdatedAt, re-fetch task and inspect UI | HTTP 409; no status or revision update; task remains nonterminal |
| Support-versus-manager separation | Open employee work list, request manager queue API, navigate unit management | Manager oversight and operations health hidden, manager queue GET 403, no owner-management form |
| Client private API isolation | Separate OWNER and CLIENT Clerk TEST contexts, copy business ID, try employee queue, manager queue, private document GET and upload; revisit client preview | All prohibited reads/writes 403, no storage URL, disclosure remains PENDING, other fictional client names absent |
| Concurrent role isolation | Three independently signed-in OWNER, SUPPORT employee and CLIENT browser contexts | Owner sees 8 business units, employee sees only bookkeeping, client cannot list units; distinct role-specific UI remains visible |

The existing `e2e/chess-demo.spec.mjs` continues to test task
transition persistence, owner eight-business tour, read-only client consent,
guest denial and automated serious/critical WCAG checks.

## Execution and evidence

The protected **manual** workflow
`.github/workflows/chess-demo-browser-e2e.yml` now discovers both browser
specs. It requires the existing `chess-demo-e2e` environment,
an exclusively fictional Neon `chess_demo` database and one Clerk TEST
instance with three **distinct verified** owner/employee/client accounts.
Its target must be `http://127.0.0.1:3000`, with no production or
financial/regulated feature switches enabled. No browser impersonation,
pre-minted session, customer data or production secret is allowed.

Normal CI syntax-checks the new spec and runs a source-policy test that
asserts the protected workflow, configured selector and prohibited access
checks remain present. The isolated `chess_demo_ci` PostgreSQL job also
checks that fictional employee work tasks are business-scoped and the
client has only PENDING consent, no active grants or service cases.
**These source and database tests do NOT establish authenticated browser
pass/fail.** A real protected Playwright run and its traces/screenshots
must be reviewed independently before declaring employee/client E2E
accepted.

**Owner supply:** canonical
[18-group checklist](CHESS_CORP_2_OWNER_SUPPLY_CHECKLIST.md), especially
**17** for protected Neon/Clerk test environment and **18** for independent
accessibility/security evidence. No new credential is required specifically
for Round 40. The interrupted Round 39 purge worker's vault-only token
placeholder and all four OFF release flags are registered under **05/04**.

## Outstanding gates

- Authenticated two-tenant role downgrade, consent withdrawal and cross-client
  browser tests using actual protected Clerk identities.
- Real scanning/redaction, legal hold/release, versioned private S3 disposal,
  independent WORM audit, PITR and controlled UNKNOWN deletion reconciliation.
- Historical all-path sensitive-read audit and external regulated-provider
  approval, settlement and finance signoff.
- Named owner/vendor/legal/finance independent approvals before deployment.

**Milestone state:** 8/8 release-blocked, 0/8 independently signed;
draft PR #24 unmerged. **No CHESS CORP 2 build-complete claim.**
