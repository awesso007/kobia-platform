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
