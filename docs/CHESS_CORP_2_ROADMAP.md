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
