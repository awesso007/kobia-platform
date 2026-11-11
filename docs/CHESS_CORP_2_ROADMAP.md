# CHESS CORP 2 - Development milestones and release gates

Branch: `feature/operations-overview`
Pull request: https://github.com/awesso007/kobia-platform/pull/24

KOBIA is the independent platform. The code below is a CHESS-specific
business-operations layer within an isolated KOBIA tenant, not an assertion
that a single legal entity holds all operating licenses.

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
