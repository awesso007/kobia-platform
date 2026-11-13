# CHESS CORP 2 — Round 30 signed-in browser acceptance

**Source branch:** `feature/operations-overview` (draft, unmerged PR #24)  
**Production:** `main` and `kobia-platform.vercel.app` must remain untouched  
**Product boundary:** Independent KOBIA multi-tenant SaaS; fictional CHESS first-service tenant

## Authenticated journey matrix (code added, execution not inferred)

| Identity | Browser acceptance | Defended boundary |
| --- | --- | --- |
| Verified allowlisted OWNER | Opens workspace overview, guided CHESS tour, eight fictional business services and five fictional clients, business unit admin screen, empty authorized finance-case queue | Owner is not the separate client identity; service records cannot appear without individual grants and current consent |
| Verified allowlisted MEMBER/SUPPORT | Signs in through real Clerk testing token and sees only one Bookkeeping unit, service desk, assigned work, calendar preference controls, no manager/admin workspaces | Manager sections, unrelated unit API reads and attempted administrative unit creation are denied |
| Same MEMBER/SUPPORT | Changes only its own fictional work item using browser UI PATCH, reopens the page to confirm persistence | Optimistic update and audit path, no terminal task transition; subsequent runs rotate between IN_PROGRESS and BLOCKED |
| Verified allowlisted CLIENT | Opens read-only `/chess-demo/client` and sees only Morgan Fictional and the PENDING `service:ACCOUNTING` disclosure | Other fictional client names are absent, untrusted profile query ignored, acceptance/withdrawal UI absent |
| Same CLIENT | Calls business-unit and consent mutation APIs and navigates employee/admin and real consent portal paths | APIs return denial, employee membership not provisioned, no consent grant or real vendor activation |
| Unauthenticated | Requests the client preview | Middleware routes the visitor to the test-only tenant login without exposing a client profile |
| OWNER, MEMBER and CLIENT | axe-core serious/critical WCAG 2.1 A/AA scans on relevant browser surfaces | Automated scans are limited to tested screens and do not replace independent accessibility acceptance |

**Implementation:** `e2e/chess-demo.spec.mjs`, `e2e/clerk.setup.mjs`, `e2e/demo-harness.mjs` and `playwright.config.mjs`. The suite signs in to Clerk using verified primary test emails, NOT mocked JWTs or application role bypasses. Tests remain serial with a fresh Playwright browser context per test. The extra owner/employee comparison uses two isolated contexts.

## Safety controls

- The test runner refuses non-development mode, live or mismatched Clerk keys, wrong database, pooled/non-Neon database, remote base URL, duplicate test identities, and any activated `CHESS_*ENABLED`, `*APPROVED` or `*CERTIFIED` switch.
- Its local server binds to `127.0.0.1:3000`, refuses an already occupied port and never connects to production by browser base URL.
- The protected manual GitHub browser workflow holds all secrets in the separate `chess-demo-e2e` environment, validates configuration before seeding and has no merge/deployment action.
- The client consent **service layer** now requires the three explicit portal approvals to accept a disclosure; in fictional mode, both acceptance and withdrawal are blocked even for a verified client. Withdrawal of an existing real-world consent remains available to an authenticated, previously granted client outside the demo if the portal UI is later disabled, subject to current identity and financial reservation guards.
- Normal GitHub CI performs browser-suite **syntax and environment-policy tests only**. The actual signed-in Playwright/Clerk/axe workflow cannot be marked green until protected owner inputs are present and an authorized operator runs the isolated suite. A green normal CI is not a signed-in browser pass.

## Prerequisites (single canonical owner-supply register)

See **item 01** of [the 18-group owner-supply checklist](CHESS_CORP_2_OWNER_SUPPLY_CHECKLIST.md). Supply a separate Neon `chess_demo` non-pooled TLS database, matched Clerk `pk_test_` and `sk_test_` keys, three different verified primary-email test users (owner, employee, client), and the protected Actions environment variables. Neither employee nor client can have MFA or additional required session tasks for Clerk's sign-in-token helper.

To run locally in the isolated development environment, first use the README `npm run demo:setup` / `npm run demo:verify` instructions. With a free local port 3000, install the pinned browser-only packages and run `npm run test:e2e`. Do not share credentials in chat, Git history or traces.

## Still open after source-only Round 30

Authenticated two-tenant/two-business role revocation races, independent legal e-sign and actual client-consent transitions, external S3/KMS/WORM and scanner receipts, full manual keyboard/screen-reader/responsive/accessibility acceptance, live provider/regulated integration, private staging deployment, DR/PITR witness, load/penetration testing and signed go/no-go remain unresolved. Those are **not** retroactively certified by Playwright source files or a normal three-job GitHub CI pass.

**Release accounting:** All 8/8 milestones remain production blocked; 0/8 independent release sign-offs. Do not merge PR #24 or deploy `main` without separate authorization.
