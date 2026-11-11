# CHESS CORP 2 - exact external configuration and go-live requirements

This configuration file contains only variable names and instructions, never
real secrets. Code is on feature/operations-overview; nothing is deployed.

## 1. Tenant database and identity (required)
- DATABASE_URL: KOBIA PostgreSQL runtime connection URL.
- DIRECT_URL: direct, nonpooling PostgreSQL connection to the intended tenant
  schema (include ?schema=tenant_<slug> for tenant migration status).
- NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: real Clerk publishable key.
- CLERK_SECRET_KEY: real Clerk server secret key.
- NEXT_PUBLIC_DEFAULT_TENANT: selected authorized tenant slug.
- CHESS_PUBLIC_ORIGIN: exact HTTPS origin for the CHESS application.
- CHESS_CONSENT_EVIDENCE_KEY: random unique 32+ character HMAC secret;
  never reuse the Clerk secret.
- Provide Clerk organization, client email verification and matching CRM
  contact records. Configure appropriate regulated electronic-signature
  vendor separately for disclosures requiring enforceable e-signatures.

## 2. Private S3 document storage (required)
- KOBIA_S3_BUCKET: PRIVATE bucket with public access blocked.
- KOBIA_S3_REGION: bucket region.
- KOBIA_S3_ACCESS_KEY_ID: short-lived, scoped credentials.
- KOBIA_S3_SECRET_ACCESS_KEY: secret for that identity.
- KOBIA_S3_ENDPOINT: optional approved S3-compatible endpoint.
- Storage credentials require tightly scoped PutObject, GetObject,
  GetObjectVersion, HeadObject and GetBucketVersioning access. The scan worker
  must read immutable object versions; public access stays blocked.
- **Bucket versioning must be Enabled**, not Suspended. Upload confirmation,
  scanning and download fail closed without a version ID and ETag. This prevents
  a file from being replaced after it has passed malware scanning.
- For S3-compatible storage, verify that versioned HEAD, GET and presigned GET
  all work. Do not use a provider without compatible object-version support.
- Set server-side encryption (SSE-KMS or provider equivalent), key rotation,
  retention/lifecycle, object-versioning, least-privilege IAM, TLS, audit
  logs and an approved data-processing agreement outside the codebase.
- Upload permission is per business/service. Uploads start PENDING, are
  verified against S3 metadata, then QUARANTINED. Only CLEAN objects are READY.

## 3. Malware scanning (required)
- Deploy and secure a ClamAV daemon in a private network with current
  signature updates. No public port exposure.
- CHESS_CLAMAV_HOST: internal DNS hostname of ClamAV daemon.
- CHESS_CLAMAV_PORT: daemon TCP port (default 3310).
- CHESS_SCAN_WORKER_TOKEN: unique random 32+ character secret for the
  machine-only POST /api/chess/scan-worker?t=<tenantSlug> endpoint.
- Set a scheduler to call that endpoint with Authorization: Bearer <token>
  and JSON {"limit":5}; restrict network access and monitor quarantined age.
- CHESS_DOCUMENT_SCAN_KEY: separate random 32+ character HMAC key for an
  OPTIONAL, independently approved external scanner callback.
- CHESS_SCAN_CALLBACK_ENABLED: keep unset or false when using ClamAV.
  The callback is disabled by default. Configure true ONLY with a vetted
  external scanner that signs tenant.timestamp.rawBody and provides trustworthy
  content digests and callback replay protection.
- No scanner success means no document download.

## 3A. Recurring operations and employee calendars
- CHESS_WORKFLOW_WORKER_TOKEN: unique random 32+ character secret for the
  machine-only `POST /api/chess/recurrences/run?t=<tenantSlug>` endpoint.
- CHESS_ACTIVE_TENANT_SLUGS: comma-separated allowlist of active, provisioned
  tenant slugs whose recurring jobs have been approved for processing.
- CHESS_SCHEDULER_ENABLED: `false` by default; set to `true` only after a
  staging pilot, production authorization and secured worker configuration.
- CHESS_PUBLIC_ORIGIN: exact HTTPS application origin. No worker credentials
  are ever placed in the request URL; use an Authorization Bearer header.
- The disabled-by-default GitHub workflow `chess-recurring-operations.yml`
  demonstrates a 15-minute worker cadence. Production may use a dedicated
  scheduler with the same private POST API. A scheduler outage is not a
  guarantee that appointments or tasks will run on time; monitor lag.
- Recurrences use UTC and support DAILY, WEEKLY and MONTHLY intervals.
  Month-end recurrences preserve their intended day where possible.
- New assigned work creates private in-app notifications. The authorized
  employee can export their assigned work as an authenticated `.ics` file.
- CHESS_CALENDAR_SYNC_ENABLED: keep `false` until the calendar gateway is
  approved and every affected employee has authorized calendar access.
- CHESS_CALENDAR_API_URL: approved HTTPS gateway's event-creation POST
  endpoint. It receives tenantSlug, businessId, workItemId, a staff reference,
  UTC start/end, a generic private title and an Idempotency-Key.
- CHESS_CALENDAR_CANCEL_API_URL: separate HTTPS POST endpoint at the SAME
  approved host that deletes a provider event by providerEventId and honors
  the unique cancellation Idempotency-Key. Both create and cancel endpoints
  must be operational before calendar sync may be enabled.
- CHESS_CALENDAR_STATUS_API_URL: third approved HTTPS POST endpoint for
  event reconciliation. Given a tenant, work item, idempotency key and
  action CREATE or CANCEL, it must return verified provider status
  (accepted, rejected, pending or not_found) and an event ID when accepted.
  "not_found" or an outage never authorizes a blind retry.
- CHESS_CALENDAR_ALLOWED_HOST: exact approved gateway hostname.
- CHESS_CALENDAR_API_KEY: gateway credential held in the server's secret manager.
- The gateway must verify a staff member's Google/Microsoft delegated OAuth
  authorization, target calendar, scoped event permissions, refresh-token
  handling, privacy policy and idempotency before creating events.
- Calendar outbox events are `PENDING`, `SUBMITTING`, `SYNCED`, `REJECTED`,
  `UNKNOWN`, `CANCEL_PENDING`, `CANCEL_UNKNOWN` or `CANCELLED`. An uncertain remote result is NEVER
  automatically retried; reconcile it with the gateway by idempotency key.
- `PATCH /api/chess/calendar-preferences` records the signed-in
  employee's own opt-in/opt-out. No administrator may opt in for them.
  Events without a personal acknowledgment are WAITING_CONSENT and may not
  be sent. The external gateway must ALSO check delegated provider OAuth.
- Employee opt-out and task cancellation queue deletion of previously
  synchronized events. A remote cancellation with an uncertain outcome is
  marked CANCEL_UNKNOWN and requires provider reconciliation.
- Calendar subscriptions via the authenticated `.ics` export are manual
  exports. The gateway hook provides optional outbound calendar event
  creation once configured. Remote cancellation, employee reassignment after
  publication, OAuth consent UI and bidirectional conflict handling remain
  independent production blockers, not solved by the adapter alone.

### Staff appointment and provider sandbox requirements
- **PostgreSQL requirement:** the migration role must be allowed to install
  `btree_gist` (or the DBA must pre-install it). Its exclusion constraint
  prevents overlapping SCHEDULED staff bookings within one KOBIA tenant,
  including across CHESS business units. It cannot coordinate across
  independent KOBIA tenants.
- **Test personnel:** provide an approved staging business unit, two active
  employee accounts and a manager account; use fictional clients only.
- **Calendar provider sandbox:** provision a test employee's delegated OAuth
  calendar connection and provide a sandbox API key, exact HTTPS host and
  three API URLs for create, cancel and status lookup.
- **Gateway contract:** event status lookup must accept action CREATE/CANCEL
  and idempotency key, returning accepted/rejected/pending/not_found and a
  provider event ID on accepted creations. A "not_found" result does not
  automatically authorize another delivery.
- **Round 4 appointment-sync gateway contract:** the existing
  `CHESS_CALENDAR_API_URL` must accept a private appointment event with
  `tenantSlug`, `businessId`, `appointmentId`, `recipientClerkUserId`,
  `startsAt`, `endsAt`, `summary: "CHESS appointment"`,
  `visibility: "private"`, and `idempotencyKey`.
  The cancel endpoint must accept the same appointment ID, remote
  `providerEventId` and a stable cancellation idempotency key. The status
  endpoint must accept `action: "CREATE" | "CANCEL"` and return
  `status: accepted|rejected|pending|not_found` plus a remote event ID
  for accepted creations. These endpoints may share the existing task
  calendar gateway; the gateway must explicitly support both resource types.
- **No new production credentials:** use `CHESS_CALENDAR_API_URL`,
  `CHESS_CALENDAR_CANCEL_API_URL`, `CHESS_CALENDAR_STATUS_API_URL`,
  `CHESS_CALENDAR_ALLOWED_HOST`, `CHESS_CALENDAR_API_KEY`,
  `CHESS_CALENDAR_SYNC_ENABLED`, `CHESS_WORKFLOW_WORKER_TOKEN`,
  and the existing approved tenant allowlist.
- Every appointment is queued at booking time but remains
  `WAITING_CONSENT` unless the assigned employee explicitly authorizes
  **appointment timing** separately from ordinary work-item calendar
  sharing. Existing task calendar consent never grants appointment access.
  The separate `PATCH /api/chess/calendar-preferences` request is
  `{"scope":"APPOINTMENTS","enabled":true,"acknowledge":true}`.
  Revocation uses `{"scope":"APPOINTMENTS","enabled":false}`.
  Global calendar opt-out also revokes the appointment category.
  The tenant migration defaults all previous employee preferences to
  `appointmentEnabled=false`.

  Cancelled appointments are removed from the remote provider if already
  synchronized. Submission outcomes that cannot be confirmed are retained
  for reconciliation; no blind retry occurs.
- **Privacy:** appointment subjects remain in the authorized workspace.
  Only generic work-item or appointment titles and times are sent through
  the configured calendar bridge. Appointment outbound events are queued and
  handled by the worker, but do not reach third-party calendars until
  provider credentials, OAuth delegation and an approved scheduler are live.
### Optional real-provider sandbox validation (manual only)
- Configure GitHub environment `chess-calendar-sandbox` with approval
  protection and **test-only** provider credentials, never production access.
- Supply environment variables `CHESS_CALENDAR_SANDBOX_VALIDATE=true`,
  `CHESS_CALENDAR_SANDBOX_ISOLATED=true`,
  `CHESS_CALENDAR_SANDBOX_TENANT`,
  `CHESS_CALENDAR_SANDBOX_BUSINESS_ID`,
  `CHESS_CALENDAR_SANDBOX_STAFF_ID`, plus the existing
  `CHESS_CALENDAR_API_URL`, `CHESS_CALENDAR_CANCEL_API_URL`,
  `CHESS_CALENDAR_STATUS_API_URL`,
  `CHESS_CALENDAR_ALLOWED_HOST` and `CHESS_CALENDAR_API_KEY`.
- The assigned sandbox staff account must independently authorize a
  dedicated test calendar through the provider's OAuth flow.
- Manually run `chess-calendar-sandbox.yml` to validate appointment
  create/status/cancel using a synthetic meeting title and no client data.
  A provider event whose cancellation cannot be confirmed requires cleanup
  in the sandbox provider. This test does not prove production compliance.
- The ordinary CI workflow does not use real provider credentials or run
  this integration; it uses mocked contract tests.

- **Activation:** keep `CHESS_CALENDAR_SYNC_ENABLED=false` and
  `CHESS_SCHEDULER_ENABLED=false` until sandbox tests and approvals pass.

## 4. Payroll execution (required to enable real transfers)
- CHESS_PAYROLL_API_URL: provider's approved HTTPS POST endpoint. The
  implementation expects {id,status:accepted|rejected|pending} and sends
  tenantId,entityId,payRunId,amounts,payDate and Idempotency-Key.
  Provider onboarding must adapt/confirm this exact contract.
- CHESS_PAYROLL_ALLOWED_HOST: exact hostname of approved provider URL.
- CHESS_PAYROLL_API_KEY: provider-issued API token scoped to payroll submissions.
- CHESS_PAYROLL_PROVIDER_CERTIFIED: keep false until signed provider onboarding,
  tested worker and tax filings, bank accounts and ACH authorizations are in place.
- CHESS_PAYROLL_EXECUTION_ENABLED: keep false until formal payroll launch.
- An explicitly approved PAYROLL_EXECUTE action with a digest matching the
  exact POSTED KOBIA PayRun is required before a dispatch.
- Existing legacy payroll withholding fields are labeled placeholders.
  This interface is NOT itself a compliant withholding/tax-filing engine.
  The selected provider MUST independently validate tax calculations, employee
  identities, funding and disbursement instructions before executing payroll.
- Provider status "accepted" means submitted, NOT proof wages were paid.
  Unknown network outcomes must be reconciled with provider; never blind retry.

## 4A. Milestone 5 accounting, bookkeeping, payroll status and tax integration

### Accounting and bookkeeping
- KOBIA's existing tenant-scoped accounting database must have provisioned
  and ACTIVE `Entity`, `Account`, `BankAccount`, `BankTransaction`,
  `JournalEntry` and `JournalLine` records.
- Each client business needs a current ACTIVE CHESS service case and
  authenticated service grant; an administrator explicitly maps the case
  to the correct existing ledger entity via `POST /api/chess/finance`.
- Bookkeeping review APIs `/api/chess/bank-reviews` only store opaque
  transaction/account references and a digest of current ledger evidence.
  Human review must be independent of the suggestion creator. An approved
  category is not posted to the general ledger. A separate accounting
  posting approval and same-tenant ledger transaction path remain required.
- Optional Plaid-backed provider gateway environment:
  `CHESS_BANK_FEED_API_URL` (HTTPS POST endpoint returning normalized
  posted USD transactions), `CHESS_BANK_FEED_ALLOWED_HOST` (exact hostname),
  `CHESS_BANK_FEED_API_KEY` (server-only secret),
  `CHESS_BANK_FEED_SOURCE=PLAID`, `CHESS_BANK_FEED_ENABLED=false`,
  `CHESS_BANK_FEED_IMPORT_ENABLED=false` by default.
  Both flags must be explicitly enabled after banking-provider authorization
  and a test-environment compliance review. A different provider requires
  adapting the source enum and gateway contract, not relabeling it as Plaid.
- The gateway request includes an opaque `providerAccountRef`,
  `since` ISO 8601 date, `includePending:false`, and
  `maxTransactions:500`. The gateway must enforce the customer's
  bank connection/consent and map the opaque account ref itself.
  The gateway response is a strict JSON object with `transactions`
  (0-500) and `truncated:false`; each transaction must have
  `externalId`, `postedDate`, signed `amountCents` string,
  `description`, `currency:"USD"` and `pending:false`.
  A truncated response is rejected rather than silently omitting records.
- Before import: provision a CHESS bank feed connection for an ACTIVE case,
  an existing legacy USD `BankAccount`, explicit service grant, and a
  separate verified `bank_feed:BOOKKEEPING` or
  `bank_feed:ACCOUNTING` consent. Only owner/admin may activate.
  `POST /api/chess/bank-feed/import` requires explicit
  `acknowledgeUnmatched:true` and a `sinceAt` within 90 days.
- Imported transactions are inserted only into the existing tenant ledger
  with `status:UNMATCHED`, no raw provider tokens, and a digest from
  tenant + bank account + provider transaction ID. Existing ledger review
  must still approve category/matching and post journals separately.
- Provider integration remains disabled without an authorized agreement,
  bank connection tokens stored in the provider gateway, webhook validation,
  sandbox evidence, data-retention policy and reconciliation audit.

- Direct feeds from outside banks have NOT been activated. Bank feed
  onboarding requires a provider selection and DPA, customer bank consent,
  explicit mapping to a permitted legacy BankAccount, token vault,
  webhook verification, idempotent import and reconciliation sandbox tests.
  Existing ledger CSV import remains available independently of CHESS.

### Tax
- A TAX service case must be ACTIVE, have validated `service:TAX` consent,
  an explicit TAX service grant, and a mapped existing ledger Entity.
- `/api/chess/tax-workpapers` snapshots posted journal entries, checks
  double-entry balance and stores an immutable checksum and entry count.
  Three distinct humans must perform creation, review and final approval.
- This is NOT tax preparation, a calculation of taxable income, electronic
  filing, a signature, an IRS acknowledgment or a substitute for preparer
  PTIN/EFIN and professional review. No tax return is sent from this API.
- To add real tax-filing integration supply the selected tax software vendor,
  licensed/preparer authorization, sandbox API agreement, e-signature policy,
  approved document exchange method and federal/state e-file status API
  contracts. No real taxpayer information should be transmitted until
  regulatory and client authorization has been reviewed.

### Read-only payroll-provider outcome reconciliation
- CHESS_PAYROLL_STATUS_API_URL: exact approved vendor HTTPS status lookup
  endpoint, on the SAME hostname as CHESS_PAYROLL_ALLOWED_HOST.
- CHESS_PAYROLL_STATUS_ENABLED: default `false`; enable only after
  CHESS_PAYROLL_PROVIDER_CERTIFIED=true and CHESS_SCHEDULER_ENABLED=true
  have been formally approved.
- Reuse the existing secret CHESS_PAYROLL_API_KEY and the tenant-worker
  token CHESS_WORKFLOW_WORKER_TOKEN (both held server-side).
- The status endpoint must accept tenantId, entityId, payRunId,
  idempotencyKey and providerRequestId, and return a JSON object with
  the exact same payRunId, matching providerRequestId (if previously known),
  status (accepted|pending|paid|failed|rejected|unknown|not_found), and
  an ISO 8601 observedAt timestamp. No employee PII or bank coordinates
  are included.
- `PROVIDER_PAID` means **vendor-reported payment only**. Do not present
  that status as verified final employee receipt, IRS deposit or settlement.
- The machine-only endpoint `POST /api/chess/payroll-status/run?t=<tenant>`
  is tenant allowlisted and authenticated by the worker bearer token.
  It never submits payroll, tax filings or ACH instructions.
- Unknown provider results are preserved for review and are NOT treated as
  permission to resubmit a payroll run.

### Optional isolated finance sandbox checks (manual, never CI default)
- `chess-bank-feed-sandbox.yml` requires the protected GitHub environment
  `chess-bank-feed-sandbox` with
  `CHESS_BANK_FEED_SANDBOX_VALIDATE=true`,
  `CHESS_BANK_FEED_SANDBOX_ISOLATED=true`,
  `CHESS_BANK_FEED_SANDBOX_ACCOUNT_REF`, and the provider URL, exact hostname,
  source=PLAID, and secret API key described above. It only validates a
  seven-day read-only response from a fake authorized bank account; it
  does not import any transaction.
- `chess-payroll-status-sandbox.yml` requires protected environment
  `chess-payroll-sandbox` with
  `CHESS_PAYROLL_SANDBOX_VALIDATE=true`,
  `CHESS_PAYROLL_SANDBOX_ISOLATED=true`,
  `CHESS_PAYROLL_SANDBOX_TENANT_ID`,
  `CHESS_PAYROLL_SANDBOX_ENTITY_ID`,
  `CHESS_PAYROLL_SANDBOX_PAYRUN_ID`,
  `CHESS_PAYROLL_SANDBOX_PROVIDER_REQUEST_ID`,
  `CHESS_PAYROLL_SANDBOX_IDEMPOTENCY_KEY` (secret),
  `CHESS_PAYROLL_STATUS_API_URL`,
  `CHESS_PAYROLL_ALLOWED_HOST` and `CHESS_PAYROLL_API_KEY` (secret).
  The provider must already contain a fictional test payroll run. This
  script only reads its status; it cannot submit a pay run or transfer money.
- Approval-gate both environments. Use no real staff, taxpayer, bank
  account or production payroll credentials. Sandbox workflows require
  manual dispatch and do not constitute a production financial audit.

## 5. Official license registry (required to enable regulated services)
- CHESS_LICENSE_API_URL: contracted official registry access or approved
  aggregator's verified lookup POST endpoint. It must return registryId,
  service, jurisdiction, status, expiresAt, sourceUrl and checkedAt.
- CHESS_LICENSE_ALLOWED_HOST: exact HTTPS hostname for that endpoint.
- CHESS_LICENSE_API_KEY: secure provider API key.
- CHESS_LICENSE_SOURCE_HOSTS: comma-separated official source hostnames
  that are accepted as proof, verified by compliance staff.
- For each professional: full public registry lookup identifier (stored in
  credentialRegistryId), license category, jurisdiction, employing broker/firm,
  and appropriately permitted affiliations.
- Do not mark licenses VERIFIED by hand; the code validates sourced ACTIVE
  results and records an independent admin reviewer. Rechecks expire after
  24 hours. Official registry provider must be selected and configured.
- Mortgage NMLS, state real estate boards, state insurance departments and
  investment adviser/broker registration may require separate provider contracts
  and legal interpretation. A single vendor is NOT assumed to cover all.

## 6. Release validation steps
1. Add these entries under GitHub Environment chess-staging as Secrets or
   Variables, following the sample workflow.
2. In the staging environment with compliant test data, run the manual
   CHESS staging release validation workflow.
3. Confirm PostgreSQL migration status, read-only connectivity checks to DB,
   S3 **with versioning enabled** and ClamAV, full unit tests, production build
   and HTTP auth smoke tests.
4. Test live provider *sandbox* requests and full reconciliation; no real ACH.
5. Run application penetration tests, backup/restore and disaster recovery
   drill, audit event append-only and role-privilege review.
6. Verify broker/employer affiliation, retention and consent legal review.
7. Only after sign-off and approved rollout: migrate each tenant with backups
   and deploy. Never copy real client data into testing.

Staging validation is a preflight, not a deployment. External provider credentials,
legal/compliance authorization and production infrastructure are NOT provisioned
by GitHub commits.
