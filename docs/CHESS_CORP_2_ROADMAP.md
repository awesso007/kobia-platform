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
