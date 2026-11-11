# CHESS CORP 4 - Round 18 Codespaces demo acceptance

**Repository:** KOBIA (independent multi-tenant SaaS).
**Branch:** feature/operations-overview; draft PR #24.
**Release:** sandbox only. Do not merge to main or deploy production.

## Implemented source-level controls

- CHESS_DEMO_MODE=true works only in development/test, with a non-pooled
  Neon URL to an independent chess_demo database, tenant chess-demo,
  Clerk test-only API keys and an exact verified test-owner email.
- npm run demo:setup deploys platform and tenant migrations into their
  separate schemas. It registers one demo tenant and creates idempotent
  fictional CRM contacts, CHESS business units, staff and work items,
  plus five PENDING test-only consent requests. No simulated grants exist.
- Demo Clerk sign-in does not query the unrelated legacy row-level tenant.
  Only the primary-verified Clerk test-user email that matches the
  owner allowlist can claim a new demo OWNER membership. No existing role
  or suspended account is auto-promoted.
- Demo overview links authorized CHESS operations. No service grants,
  real consent evidence, licensed credentials, customer files, payments,
  payroll funding, regulated handoffs or external credentials are seeded.

## Validation and release hold

- Automated guard unit tests reject production NODE_ENV, live Clerk
  keys, pooled/wrong Neon database and missing conditions.
- CI must verify lint, typecheck, unit tests, build and PostgreSQL
  migrations/integration on the final commit.
- Actual Codespaces/Neon/Clerk manual exercise is pending owner-provided
  sandbox credentials. A commit or a green CI check is not proof that
  a browser session or database seed was successfully run.
- M3 consent, M5 posting/settlement/tax/payroll, M6 licensed execution,
  M7 payment settlement and M8 independent DR/security/staging/approvals
  remain BLOCKED as enumerated in the open-items register.

## Values the owner supplies locally, not in this repository

1. Independent Neon chess_demo non-pooled DATABASE_URL.
2. Clerk test publishable key and test secret key.
3. Verified Clerk test-user email, plus allowed Codespaces origin setting.

Never use real customers or production accounts in this demo.


## Round 19 verification follow-up

- CI previously skipped demo-fixtures.integration.test.ts. The PostgreSQL job now
  explicitly runs it alongside schema.integration.test.ts with
  RUN_CHESS_DB_INTEGRATION=1. An ordinary green application build alone was
  insufficient evidence for the demo seed.
- Codespaces setup now performs a read-only, pre-migration catalog and registry
  inspection. It refuses unrelated public tables, independent tenant schemas,
  or existing non-DEMO tenant mappings before any DDL.
- Repeating the fictional setup never reinstates a revoked employee assignment.
  Setup refuses to report success if required fictional active assignments,
  expected pending consent, or no-service-grant invariants are broken.
- /app/demo is a gated tenant-scoped guided preview of the eight CHESS service
  families. Only the demo tenant's active OWNER/ADMIN sees fictional names and
  counts; no permission, consent, license, financial or external execution
  is granted by the demo switch.
- NEXT_PUBLIC_CLERK_SIGN_IN_URL and NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL
  must replace the older generic values in the Codespaces .env.local.
- Actual live Codespaces/Neon/Clerk browser sign-in remains EXTERNAL
  until the owner supplies sandbox credentials. Green CI cannot certify a
  browser session, the physical Neon sandbox or professional consent.

**Release status: still not merged/deployed.** No source-level demo
completion can close the independent M1-M8 regulatory and operational gates.


## Round 19 dedicated migration integration coverage

The ordinary PostgreSQL CI job now creates a **second CI-only database**
(chess_demo_ci), applies the platform schema migrations to public, creates
tenant_chess_demo, deploys all tenant migrations into that dedicated schema
and runs the repeatability/no-privilege seed test against it. The original
tenant SQL regression tests still run separately on chess_ci. This proves
the migrations and fictional seed can coexist without writing CHESS records
into public. It is **not** a live Neon Codespaces test and cannot satisfy
the external DEMO-01 or M8 staging/security approvals.
