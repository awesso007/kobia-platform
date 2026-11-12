# CHESS CORP 4 — Round 25 Codespaces fictional demo acceptance

**Repository:** awesso007/kobia-platform
**Branch:** feature/operations-overview / draft PR #24
**Release:** No merge, no production deployment. Fictional sandbox only.

## Scope and evidence boundaries

| Acceptance step | Code / CI coverage | Actual hosted Codespaces status |
| --- | --- | --- |
| Isolated Node environment, forwarded port 3000 | Versioned .devcontainer/devcontainer.json uses Node20, automatic npm ci and forwarded port metadata; unit test validates config | **EXTERNAL: actual Codespace startup and forwarded URL unverified** |
| One command after sandbox credentials are configured | npm run demo:setup enforces NODE_ENV=development/test, DEMO switch, exact owner allowlist, Clerk pk_test_/sk_test_, non-pooled TLS Neon database chess_demo | **EXTERNAL: a Neon URL and owner test keys were not supplied here** |
| Pre-migration database refusal | Rejects unrelated public tables, ANY unrelated user-defined schema, all foreign/inactive/wrong tenant registrations before DDL | **CI: unit and disposable PostgreSQL coverage; real Neon inventory untested** |
| Actual platform and tenant migration path | CI provisions a second isolated PostgreSQL database, migrates platform public and tenant_chess_demo separately | **CI PASS required on latest SHA; hosted Neon untested** |
| Tenant registration | Shared script registers only chess-demo, plan DEMO, status ACTIVE; new real PostgreSQL integration checks register twice and inventory audit | **CI PASS required; live tenant registration untested** |
| Fictional seed and repeatability | Real PostgreSQL integration seeds twice and confirms 8 units, 24 fictional assignments, 5 clients, 10 links, 8 work items, 5 pending disclosures and ZERO grants, cases, credentials or invoices | **CI PASS required; hosted Neon seed untested** |
| External feature safety | Demo guard refuses production, live Clerk keys, wrong database, wrong schema/default tenant, and activated outbound service flags | **CI tests; no live external vendor requested** |
| Read-only install check | npm run demo:verify rechecks demo database registration, isolation and fixture counts without mutations | **CI exercises same shared verification; owner's real Codespace invocation pending** |
| Browser login/verified owner grant | /chess-demo/login is Clerk development login; /app/overview claims only matching verified-primary-email Clerk TEST user; /app/demo checks current owner and demo tenant schema | **EXTERNAL: real Codespaces/Clerk session not executed** |
| Guided tour and unauthorized user denial | Eight fictional service cards and three summary counts are implemented, routes are guarded by active signed-in membership and test-only tenant | **EXTERNAL: independent browser/session testing, accessibility/keyboard checks and screenshots pending** |

**No false completion:** no GitHub source-level CI can prove the external Codespace
port, live Neon account, Clerk verified browser session, vendor/regulated
approvals, payment settlement or legal validity. Do not call this
full end-to-end verified until an owner/authorized operator supplies
a real sandbox and independently signs off the actual browser acceptance.

## Minimal real Codespaces acceptance steps

1. GitHub Codespaces > new with options > **feature/operations-overview**.
   Wait for postCreateCommand npm ci; verify Node20 and branch.
2. Supply isolated Neon chess_demo and Clerk development-only keys + a
   verified, allowlisted TEST email in untracked .env.local.
   Use the exact private forwarded HTTPS URL for CHESS_PUBLIC_ORIGIN and
   NEXT_PUBLIC_APP_URL. Add that HTTPS origin to Clerk dev redirects.
3. Run **npm run demo:setup** (only database setup command), then
   **npm run demo:verify** (read-only integrity). Record zero real grants
   and zero execution records.
4. Start **npm run dev -- -H 0.0.0.0**; open /chess-demo/login on port 3000,
   sign in using the allowlisted test identity; open /app/overview then
   /app/demo. Verify 8/3/5, all eight service links, fictional tasks and
   explicit nonexecuting consent/regulated/financial labels.
5. Anonymous browser and an unallowlisted Clerk test user must not
   access /app/demo or auto-claim OWNER. No real customer data, loan,
   wage, insurance, investment, tax return or merchant transaction.
6. Save redacted acceptance evidence: reviewed SHA, Codespace port URL,
   protected tenant schema, screenshot/record, results of denied access,
   tester identity (not cookie/secret), test date, independent reviewer.
   Tear down the test data according to approved sandbox retention.

## Owner-provided external inputs (single source)

The **only authoritative supply list** remains
[CHESS_CORP_2_OWNER_SUPPLY_CHECKLIST.md](CHESS_CORP_2_OWNER_SUPPLY_CHECKLIST.md),
**item 01**. Provide those secrets directly to the isolated Codespace
environment or an approved secrets vault, NOT ChatGPT, source, issues or PR
comments. Additional vendor keys/licenses are NOT needed to tour fictional
records, and adding them is prohibited by the demo environment check.

## Round 25 changes

- Tightened pre-DDL catalog inspection to reject ANY unrelated application
  schema and removed limited registry sampling.
- Extracted a shared registration and seeding implementation so CI's real
  PostgreSQL tests execute the same tenant-creation path as the command.
- Added read-only npm run demo:verify, checked by the same CI fixture suite.
- Disallowed activated external-service flags in the demo environment.
- Pinned a Codespaces Node environment with automatic npm ci and port 3000.
- Corrected README exact origins, one-command setup, expected fixture
  counts, real sign-in denial/acceptance and evidence recording.

**Status: isolated code-level integration verified only if the current
commit's three CI jobs succeed. Actual hosted Codespaces E2E remains
EXTERNAL OPEN until signed-in browser test is performed. The full M1–M8
roadmap remains incomplete.**
