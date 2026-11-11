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
  fictional CRM contacts, CHESS business units, staff and work items.
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
