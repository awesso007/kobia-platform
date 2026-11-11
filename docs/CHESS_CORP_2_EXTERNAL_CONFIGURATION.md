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

## 5A. Milestone 6 regulated provider workflows (DISABLED by default)

### Individual licensing and firm affiliation
- **Individual licensing** keeps the existing `CHESS_LICENSE_API_URL`,
  `CHESS_LICENSE_ALLOWED_HOST`, `CHESS_LICENSE_API_KEY` and
  `CHESS_LICENSE_SOURCE_HOSTS`. Verified status must be sourced from a
  licensed, contracted gateway connected to current official registries,
  and refreshed in the preceding 24 hours.
- **Affiliation verification:** supply `CHESS_AFFILIATION_API_URL`
  (firm/individual affiliation verification HTTPS POST endpoint),
  `CHESS_AFFILIATION_ALLOWED_HOST` (exact hostname),
  `CHESS_AFFILIATION_API_KEY` (server-only secret),
  `CHESS_AFFILIATION_SOURCE_HOSTS` (comma-separated official source hosts),
  and `CHESS_AFFILIATION_VERIFICATION_ENABLED=false` by default.
- Each practitioner requires an existing service credential and active staff
  assignment, their **public official individual registry ID**, the
  **associated employing broker/agency/adviser firm's registry ID**,
  jurisdiction, and independently approved official evidence demonstrating
  CURRENT employment or authorized affiliation. Entering identifiers creates
  an UNVERIFIED affiliation; it never grants authority on its own.
- The gateway accepts
  `{practitionerRegistryId,firmRegistryId,service,jurisdiction}` and
  returns matching identifiers, `status: ACTIVE|INACTIVE|REVOKED|SUSPENDED|UNKNOWN`,
  `checkedAt`, `expiresAt` and `sourceUrl`. Only matching ACTIVE records
  originating from explicitly allowlisted HTTPS official-source hosts can
  become VERIFIED. An independent administrator must initiate verification.
- **Regulatory sources vary:** mortgage requires relevant NMLS individual,
  company and sponsoring/employing broker verification; insurance requires
  the state DOI license plus agency/company appointments or affiliations as
  applicable; California real estate uses DRE salesperson/broker and
  responsible broker records as applicable; securities/investment work
  requires service-specific CRD/IARD, state/SEC/FINRA and employer/firm
  registration/supervision where applicable. A listed credential alone does
  not authorize every activity. Have counsel/compliance define the correct
  verification contract for each service and jurisdiction.

### Client coordination, no transaction execution
- `CHESS_REGULATED_HANDOFF_API_URL`: approved HTTPS POST for an **opaque
  coordination ticket only**, not loan origination, carrier quote/binding,
  an agency agreement or a securities recommendation/order.
- `CHESS_REGULATED_STATUS_API_URL`: approved HTTPS POST read-only ticket
  status endpoint. Both URLs must share the exact hostname in
  `CHESS_REGULATED_ALLOWED_HOST` with redirects blocked.
- `CHESS_REGULATED_API_KEY`: separate server-side gateway bearer secret.
- Four independently approved, opaque partner identifiers:
  `CHESS_REGULATED_PARTNER_MORTGAGE`,
  `CHESS_REGULATED_PARTNER_INSURANCE`,
  `CHESS_REGULATED_PARTNER_REAL_ESTATE`,
  `CHESS_REGULATED_PARTNER_INVESTMENTS`.
- `CHESS_REGULATED_HANDOFF_ENABLED=false`: default. Enable only after
  contract, privacy impact assessment, firm affiliation audit, supervised
  sandbox pilot, and authorization to disclose opaque cross-service case
  references to the receiving partner.
- Handoff submits exactly `tenantSlug,businessId,serviceCaseId,workflowId,
  service,kind,idempotencyKey,partnerId`. It NEVER includes client names,
  taxpayer identifiers, application data, medical histories, property
  details, investment holdings or trading instructions. Partner systems
  must separately authenticate the client, obtain mandatory sector-specific
  disclosures/consents, and validate eligibility.
- Gateway responses are strict
  `{workflowId,id?,status:accepted|pending|rejected|not_found}`.
  `accepted` requires a provider ID and means **ticket acknowledged only**;
  it is not underwriting, insurance binding, brokerage completion, trading
  authorization, or investment advice.
- A partner handoff requires TWO independent purpose-bound GRANTED client
  consents: `service:<SERVICE>` and `external_handoff:<SERVICE>`.
  Both must have genuine client acceptance evidence and remain unwithdrawn.
  Checklists are human attestations, not statutory signoffs. Only approved
  internal cases and a three-person author/reviewer/approver chain may
  request a ticket, after rechecking individual licensing and firm
  affiliation within 24 hours.
- An uncertain network response is recorded UNKNOWN, never blindly retried.
  The status API resolves the same workflow and remote reference; only a
  validated vendor acknowledgment can mark SUBMITTED.
- **Not covered:** actual mortgage LOS/API integration, price/rate disclosures,
  agency/brokerage agreements, consumer insurance needs-analysis suitability,
  carrier quoting and binding, real estate offers/contracts, advisory
  suitability/best-interest requirements, trading, or regulatory reporting.
  Those require distinct provider-specific contracts and compliance reviews.

### Sandbox inputs you must supply
- Separate fictional staging client, three distinct active reviewer accounts
  with explicit per-service grants, a licensed-test practitioner, an approved
  test business unit, and a test partner/firm affiliation verifiable through
  the contracted registry gateway. No actual public practitioner status
  must be artificially asserted.
- Fake individual/firm registry test identifiers with confirmed sandbox
  matching evidence and test customer consents for BOTH service and
  external_handoff purposes; do not use live customers.
- An isolated provider sandbox accepting coordination tickets and idempotent
  GET/POST status lookups without causing regulated activity.
- Protected GitHub environment for the manual M6 sandbox check;
  all provider secrets only in environment Secrets, never the repository.
  The default CI mocks vendor contracts and **does not** verify a
  functioning third-party mortgage, insurance, real estate or investments
  system.

### Manual, isolated Milestone 6 acceptance workflow
- In GitHub, create a protected `chess-regulated-sandbox` environment.
  Set `CHESS_M6_SANDBOX_VALIDATE=true` and
  `CHESS_M6_SANDBOX_ISOLATED=true` ONLY after the provider guarantees
  that a coordination ticket is non-transactional and uses fictional data.
- Supply `CHESS_M6_SANDBOX_SERVICE` (one of MORTGAGE, INSURANCE,
  REAL_ESTATE, INVESTMENTS), `CHESS_M6_SANDBOX_PRACTITIONER_REGISTRY_ID`,
  `CHESS_M6_SANDBOX_FIRM_REGISTRY_ID`,
  `CHESS_M6_SANDBOX_JURISDICTION`, `CHESS_M6_SANDBOX_TENANT`,
  `CHESS_M6_SANDBOX_BUSINESS_ID`, the official individual-license API URL,
  approved hostname, source-host allowlist and secret key, the M6 affiliation
  API/source host configuration and secret key, and the partner handoff/status URLs,
  approved hostname and secret key. Also supply the relevant
  `CHESS_REGULATED_PARTNER_<SERVICE>` variable.
- Manually dispatch `chess-regulated-sandbox.yml` once for each service
  using a freshly issued fictional test client and a test partner.
  It checks current independent firm affiliation, submits a synthetic
  coordination ticket and checks status by the SAME workflow/provider ID.
  It does not originate a mortgage, bind a policy, submit an offer or
  place a trade.
- This workflow is **not** the default CI test. Do not use real clients,
  real registry passwords, employee financial data or production service
  accounts. Clean up synthetic tickets in the test provider as required.
- Additional signed provider consent, acceptance logging, retention,
  revocation/cancellation protocol and independent legal review are
  required to enable live client referrals. Current code does not
  automatically cancel an already-sent external ticket after withdrawal.

## 5B. Milestone 7 AI triage, client billing and reporting

### AI operations (OFF unless independently authorized)
- Provide `CHESS_AI_TRIAGE_API_URL` (approved, private HTTPS POST gateway),
  `CHESS_AI_ALLOWED_HOST` (exact allowlisted hostname, standard HTTPS),
  and `CHESS_AI_API_KEY` (server-only secret).
- Set `CHESS_AI_TRIAGE_ENABLED=false` by default. It requires a separately
  approved `CHESS_AI_DATA_SHARING_APPROVED=true` only after a legal
  data-processing agreement, vendor retention/deletion assessment, and
  suitability/security review. The tenant scheduler also requires
  `CHESS_SCHEDULER_ENABLED=true`, an approved tenant allowlist and
  `CHESS_WORKFLOW_WORKER_TOKEN`. Leave all flags OFF until approved.
- The gateway receives only:
  `{"purpose":"WORK_ITEM_TRIAGE_V1","features":{"status":"TODO|IN_PROGRESS|BLOCKED|COMPLETED|CANCELLED","dueBucket":"OVERDUE|WITHIN_48_HOURS|LATER|UNSCHEDULED","hasAssignee":boolean}}`.
  The real JSON uses one enum value for each property.
  **Do not send** client names, task titles, tax/payment records, medical
  or mortgage details, identifying documents, email addresses, or arbitrary
  prompts. The AI proxy must not log or enrich the request with PII.
- Respond with a strict JSON object:
  `{"priority":"LOW|NORMAL|HIGH","recommendation":"KEEP_QUEUE|REVIEW_DEADLINE|ESCALATE_TO_MANAGER","rationaleCode":"DEADLINE_OVERDUE|DEADLINE_SOON|TASK_BLOCKED|NO_ASSIGNEE|ORDINARY_QUEUE|TASK_CLOSED","modelVersion":"approved-id"}`.
  Closed tasks cannot be escalated; blocked work must request human
  escalation; overdue active work may not be downgraded LOW.
- The private signed-in `/api/chess/ai-triage` route and tenant-allowlisted
  machine-only `/api/chess/ai-triage/run?t=<tenant>` create PENDING
  suggestions bound to source task fingerprints. The worker examines at
  most 25 new candidate tasks per run and never executes a change.
  An independent active OWNER/ADMIN must accept or reject each suggestion.
  After an ACCEPTED suggestion, a separately initiated, authorized PUT
  /api/chess/ai-triage may create ONE generic manager follow-up task and an
  in-app notification if the original task state is unchanged. The source
  task, due date, client records and financial statements are never modified.
  A database constraint prevents recording an executed follow-up before
  acceptance; the applied marker and new task commit atomically.
- Actual AI vendor models and cost controls have NOT been tested with
  real provider credentials; no autonomous bookkeeping, tax filing, payroll,
  licensed decisioning, invoice collection or regulated client outreach is
  implemented by this triage.

### Client invoices (invoice delivery only, NOT payment execution)
- Configure `CHESS_BILLING_DELIVERY_API_URL` (approved HTTPS POST create/
  delivery endpoint), `CHESS_BILLING_STATUS_API_URL` (same-host read-only
  status endpoint), `CHESS_BILLING_ALLOWED_HOST` (exact hostname),
  and `CHESS_BILLING_API_KEY` (server-only vendor secret).
- Keep `CHESS_BILLING_DELIVERY_ENABLED=false` and
  `CHESS_BILLING_VENDOR_CERTIFIED=false` until the vendor's contract,
  data-processing review, billing-contact identity mapping, client
  invoice-delivery opt-in, tax/fee treatment and noncollection controls
  have been independently approved. Both flags must be true to activate.
- Invoicing is restricted to ACCOUNTING, BOOKKEEPING, PAYROLL and TAX
  ACTIVE service cases. An authorized employee must have explicit
  service-write access and both current client consents
  `service:<SERVICE>` and `billing:<SERVICE>`.
  Each draft uses a fixed service product code, a positive USD cent amount
  no greater than 1,000,000,000, and an idempotent request key. A separate
  OWNER/ADMIN must approve; a third active authorized sender submits
  an approved invoice. No automatic debit or transfer is possible.
- Delivery payload is only `tenantSlug,businessId,clientProfileId,
  serviceCaseId,invoiceId,service,descriptionCode,currency:"USD",
  amountCents:string,idempotencyKey`. It intentionally carries no
  client email, billing address, tax ID, card/bank details or clinical data.
  The approved external vendor must separately verify that the opaque
  customer mapping is authorized; it must **only issue an invoice**.
- A strict vendor response is
  `{invoiceId,id?,status:accepted|pending|rejected|not_found}`.
  `accepted` requires a provider invoice ID. It means acknowledged for
  delivery, NOT received/paid/settled. An uncertain response remains UNKNOWN
  and is never automatically resent. Status is reconciled by the same
  stable idempotency key and provider ID.
- Real payment processing, subscription plans, sales-tax calculations,
  AR application, collections, payment-webhook signing and double-entry
  posting are separate integrations and remain BLOCKED until contracted,
  compliant financial execution and independent approval are implemented.

### Business reporting
- The restricted `/app/operations-intelligence` page and
  `GET /api/chess/operations-report?businessId=<unit>&month=YYYY-MM`
  return monthly business-unit counts and invoice totals (string cents).
  Add `&format=csv` for a no-store, aggregate-only CSV download.
- Metrics count records CREATED in the specified UTC month and group them by
  current status. They are not historical month-end snapshots, audited
  revenue, actual income, cash collected, or tax results; provider
  reconciliation and the general ledger remain sources of truth for those.
- No external reporting API key is needed for the business-unit operational
  dashboard. Consolidated financial statements require entity ownership,
  intercompany eliminations, reviewed ledger postings and accounting
  policy approval before a future reporting release.

### M7 test-only vendor inputs
- Protected GitHub environment `chess-m7-sandbox` with
  `CHESS_M7_SANDBOX_VALIDATE=true` and
  `CHESS_M7_SANDBOX_ISOLATED=true` only after vendor guarantees a
  nonexecuting fake-data sandbox.
- Supply `CHESS_M7_SANDBOX_TENANT`,
  `CHESS_M7_SANDBOX_BUSINESS_ID`, the approved AI endpoint/host/secret,
  and the approved billing create/status URLs, host and vendor secret.
  Manually run `chess-m7-sandbox.yml` with a fictional test account.
  It validates a generic BLOCKED task recommendation and the create/status
  contract of a synthetic one-dollar invoice. It CANNOT transfer money or
  execute licensed decisions. Clean up fake provider invoices after testing.
- Never put client data, protected person identifiers, payment credentials
  or production gateway tokens into CI, sample payloads or logs.

## 5C. Milestone 8 independent audit archive and disaster recovery

### Immutable out-of-band audit archive (OFF by default)
- Configure an approved independent WORM archive service exposing
  `CHESS_AUDIT_ARCHIVE_URL` (HTTPS POST append-only event ingestion)
  and `CHESS_AUDIT_STATUS_URL` (HTTPS POST read-only event status lookup).
  Both must use `CHESS_AUDIT_ALLOWED_HOST` as the exact hostname and
  must reject redirects. Provide `CHESS_AUDIT_ARCHIVE_API_KEY` as
  a protected, scoped server secret.
- Generate `CHESS_AUDIT_HASH_KEY` as a strong, unique, **at least
  32-character** high-entropy HMAC key, stored in a secret vault.
  Retain historical key versions: rotating this key before backlog
  archival invalidates pending event digests.
- Keep `CHESS_AUDIT_EXPORT_ENABLED=false` and
  `CHESS_AUDIT_RETENTION_APPROVED=false` until independent
  regulatory retention/legal hold, deletion policy, provider DPA,
  incident response and offsite access controls are signed off.
  Activating requires both flags true, an approved active scheduler,
  allowlisted tenants and a protected `CHESS_WORKFLOW_WORKER_TOKEN`.
- The exporter only sends `tenantSlug,eventId,occurredAt,actionTag,
  resourceTypeTag,decision,businessTag,actorTag,resourceTag,digest`.
  Staff, business and resource identifiers are HMAC pseudonyms,
  and arbitrary free-text source event labels are REJECTED locally.
  Original security event records are never modified by the exporter.
- Provider response must exactly match
  `{eventId,digest,status:archived|pending|rejected|not_found,receiptId?}`.
  ARCHIVED requires a provider receipt ID. UNKNOWN/PENDING outcomes
  are resolved by the status lookup; the create request is never blindly
  resent. PostgreSQL prevents updating/deleting confirmed archived
  receipts, and existing CHESS source security events have their own
  append-only trigger.
- Set the manual protected GitHub environment `chess-audit-sandbox`
  with `CHESS_AUDIT_SANDBOX_VALIDATE=true`,
  `CHESS_AUDIT_SANDBOX_ISOLATED=true`,
  `CHESS_AUDIT_SANDBOX_TENANT`, the URLs, allowlisted host and
  both protected secrets. Manually run
  `chess-audit-archive-sandbox.yml` with a fictional event.
  The test checks event receipt and status identity; it CANNOT prove
  the provider's actual regulatory WORM guarantees, independent audit
  controls, or retention under a legal hold. Preserve vendor evidence.
- Owners/admins can inspect aggregate archive backlog and UNKNOWN
  outcomes via the existing worker-health endpoint. A green CI job
  does not establish a real archive provider or successful live export.

### Authenticated two-tenant access/CSRF regression (manual-only)
- Create two fictional, separately configured staging tenants, at least
  two active business units, a service case with a current accepted
  client consent and an explicit manager service grant, plus a second
  staff account that has NO grant to that case. Do not use real customers
  or staff sessions.
- Create the protected GitHub environment `chess-authz-e2e` and set
  `CHESS_AUTHZ_E2E_VALIDATE=true`,
  `CHESS_AUTHZ_E2E_ISOLATED=true`,
  `CHESS_AUTHZ_E2E_ALLOWED_HOSTS` (comma-separated EXACT two trusted
  HTTPS staging hostnames; no arbitrary host permitted),
  `CHESS_AUTHZ_E2E_BASE_URL` (HTTPS tenant A origin),
  `CHESS_AUTHZ_E2E_OTHER_TENANT_URL` (HTTPS tenant B origin),
  `CHESS_AUTHZ_E2E_BUSINESS_ID` (allowed unit in tenant A),
  `CHESS_AUTHZ_E2E_OTHER_BUSINESS_ID` (unit not authorized to
  the manager from tenant A),
  `CHESS_AUTHZ_E2E_SERVICE_CASE_ID` (explicitly granted ACTIVE case),
  `CHESS_AUTHZ_E2E_OTHER_CASE_ID` (inaccessible case),
  and `CHESS_AUTHZ_E2E_MONTH` in YYYY-MM format.
- Supply TWO distinct, temporary Clerk sandbox session cookies as
  protected secrets: `CHESS_AUTHZ_E2E_MANAGER_COOKIE` and
  `CHESS_AUTHZ_E2E_NO_GRANT_COOKIE`. Do not log them, reuse real
  authentication sessions, or retain them after the test.
- Run `chess-authz-e2e.yml` manually. It requires actual authenticated
  200 responses for authorized reporting and an authorized case, then
  checks denied cross-business, ungranted-staff and foreign-tenant reads
  plus forged Origin POST denial. Redirect-to-login and generic server
  errors never count as passing access-control checks.
- The regression does not replace a full independent penetration test,
  role-based browser test, record mutation race tests, accessibility audit
  or public endpoint threat model. All remain preproduction gates.

### Verified backup and isolated restore drill (manual-only)
- **First**, the DR operator must independently provision an encrypted,
  compliance-locked, versioned object in a backup bucket and restore
  a separate, read-only PostgreSQL database from that backup. This
  workflow cannot perform a backup, production access or database restore.
- Create a protected `chess-dr-restore` GitHub environment with
  `CHESS_DR_VALIDATE=true`,
  `CHESS_DR_ISOLATED_RESTORE=true`,
  `DIRECT_URL` (the source database URL; secret),
  `CHESS_DR_RESTORE_DATABASE_URL` (a different restored database
  name, isolated credentials; secret),
  `CHESS_DR_RESTORE_ALLOWED_HOST` (exact isolated database hostname),
  `CHESS_DR_TEST_TENANT` (safe fictional tenant slug), and
  `CHESS_DR_WITNESS_SECURITY_EVENT_ID` (a real immutable test
  event from BEFORE the backup; protected).
- Backup object configuration:
  `CHESS_DR_BACKUP_BUCKET`,
  `CHESS_DR_BACKUP_OBJECT_KEY`,
  `CHESS_DR_BACKUP_OBJECT_VERSION`,
  `CHESS_DR_BACKUP_REGION`,
  `CHESS_DR_BACKUP_ENDPOINT` (optional S3-compatible HTTPS endpoint),
  `CHESS_DR_BACKUP_ALLOWED_HOST` (exact hostname if endpoint is supplied),
  `CHESS_DR_BACKUP_ACCESS_KEY_ID` (secret),
  `CHESS_DR_BACKUP_SECRET_ACCESS_KEY` (secret),
  `CHESS_DR_MAX_BACKUP_AGE_HOURS` (1-72, default 24),
  and `CHESS_DR_REQUIRE_PG_SSL=true`.
- The object must be nontrivial, server-side encrypted, versioned, in
  S3 Object Lock COMPLIANCE mode and retained more than 24 hours.
  The read-only worker checks version, object freshness and a known
  immutable audit-event witness in the separately restored tenant schema.
  It also checks critical consent, audit, invoice and regulated workflow
  tables. No production rows are changed or copied to CI logs.
- Manually run `chess-dr-restore-validate.yml` after the external
  restore. Keep a signed drill record with restore start/end timestamps,
  measured recovery point objective (RPO), recovery time objective (RTO),
  backup owner, witness provenance and independent approval. The
  script alone does NOT prove RPO, RTO, point-in-time restore, full
  ledger balance validation or production failover.
- Disaster recovery remains a release blocker until an independently
  supervised rehearsal verifies actual application startup, privacy
  controls, accounting consistency, backups, encryption, and restore
  time against agreed RTO/RPO targets.

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


## 5D. Round 10 M8 protected deployment evidence

Read `docs/CHESS_CORP_2_M8_ROUND10_ACCEPTANCE.md` for the exact new
environment variable names and expected test fixtures.
- Staging deployed app requires `CHESS_STAGING_ATTESTATION_ENABLED`,
  `CHESS_STAGING_ATTESTATION_TOKEN`, `CHESS_RELEASE_SHA`.
  The protected `chess-staging` workflow also requires
  `CHESS_STAGING_VALIDATE`, `CHESS_STAGING_BASE_URL` and
  `CHESS_STAGING_ALLOWED_HOST`. Its expected SHA is `github.sha`.
  An external platform must actually deploy the reviewed code first.
- Authenticated E2E now additionally requires a fictional independent
  tenant-B manager cookie, a tenant-B business ID and a synthetic
  tenant-A revoked-consent case ID. It never creates fixtures.
- DR now additionally requires independent host isolation, a SELECT-only
  witness account and operator-witnessed RPO/RTO timestamp evidence
  (`CHESS_DR_DRILL_STARTED_AT`, `CHESS_DR_RESTORE_READY_AT`,
  `CHESS_DR_SOURCE_LATEST_AT`, `CHESS_DR_RESTORED_LATEST_AT`,
  `CHESS_DR_RTO_TARGET_MINUTES`, `CHESS_DR_RPO_TARGET_MINUTES`,
  `CHESS_DR_EVIDENCE_TICKET`). Providing timestamps alone is not
  independent recovery validation.
- Staging invokes `npm audit --omit=dev --audit-level=high` and fails
  for unresolved high/critical production dependencies.
- External audit WORM, sandbox vendors, security review and signed
  legal/compliance approval remain release blockers.


## Round 11 - consent evidence write-once migration requirements

- Apply the additive tenant-schema migration
  `20261111334000_chess_m3_consent_evidence_integrity` to each
  approved tenant ONLY after verified backup, legacy consent evidence
  inventory, rollback compatibility rehearsal and compliance sign-off.
  It does not retroactively authenticate a legacy GRANTED row.
- Configure the existing `CHESS_CONSENT_EVIDENCE_KEY` as a unique,
  high-entropy, 32+-character secret in the approved vault; do not
  reuse an AI, audit, S3, or webhook token. Preserve necessary old key
  versions with independent retention/rotation approval.
- Restrict the runtime DB role from `ALTER TABLE`, `DROP TRIGGER`,
  `CREATE FUNCTION`, schema ownership or superuser privileges.
  A schema owner could otherwise bypass PostgreSQL trigger protections.
- The owner must supply a verified client identity/signature provider
  when required, signed disclosures and retention/deletion/legal-hold
  guidance, separate fictional client test sessions and approved
  migration evidence. Use the exact existing M3 S3/ClamAV and Clerk
  configuration placeholders from earlier sections for independent
  staging tests.
- `docs/CHESS_CORP_2_ROUND11_OPEN_ITEMS.md` is the current full
  checklist of remaining Milestones 1-8 code, vendor credentials,
  authenticated E2E and release approvals. This migration is a
  development security control, NOT a legal e-signature integration.


## Round 12 - client consent portal approval and test inputs

- `CHESS_CLIENT_CONSENT_PORTAL_ENABLED=false` until tested against
  fictional signed-in client sessions in isolated staging.
- `CHESS_CLIENT_PORTAL_POLICY_APPROVED=false` until a named
  authorized reviewer approves the exact client-facing disclosure,
  withdrawal language, service purpose and legal retention rules.
- `CHESS_CLIENT_PORTAL_IDENTITY_APPROVED=false` until the mapping
  of Clerk verified primary email to the tenant's active client
  contact is independently accepted and reviewed for account
  recovery, duplicate email and cross-business boundaries.
- Existing `CHESS_CONSENT_EVIDENCE_KEY`, `CHESS_PUBLIC_ORIGIN`,
  Clerk credentials, tenant PostgreSQL migrations and private
  consent identity remain mandatory; never commit live credentials.
- All three flags must be explicitly true to expose
  `/client-consents?tenant=<approved-slug>`. The same tenant
  selector must be used for the consent API; the portal checks
  the client's identity again for each sensitive read or mutation.
- See `docs/CHESS_CORP_2_M3_ROUND12_PORTAL.md` for test scenarios.
  This UI does not deliver legal e-signatures or document intake,
  so M3-01 and M3-02 are not independently release-complete.


## Round 13 - employee screen rollout inputs

Before releasing the new employee pages, supply separate fictional
Clerk test identities for owner/admin, staff, licensed practitioner
and client; verify the per-business assignment and explicit service
grant boundary in both approved staging tenants.

- Secure direct-to-S3 employee document upload additionally needs
  private **bucket CORS PUT** permissions for the exact approved
  application HTTPS origin, versioning/retention, malware worker
  and confirmed scanner quarantine-to-READY behavior. No client
  document may be downloaded while unscanned or access-revoked.
- Official license review UI requires the preexisting independent
  registry credentials (`CHESS_LICENSE_API_URL`,
  `CHESS_LICENSE_ALLOWED_HOST`, `CHESS_LICENSE_API_KEY`,
  `CHESS_LICENSE_SOURCE_HOSTS`) and evidence reviewed by
  an administrator distinct from the practitioner.
- Bank-feed employee setup needs the existing disabled-by-default
  `CHESS_BANK_FEED_*` gateway variables, a fictional authorized
  Plaid account, approved provider account reference, mapped
  active legacy ledger entity and bank-account records and
  both purpose-bound client consents. No provider sends funds
  from these screens.
- Consent requests require current exact approved policy text
  and separately verified client acceptance; generic operational
  approvals never substitute for payment/regulated authorization.
- Full named UI inventory and separate staging acceptance:
  `docs/CHESS_CORP_2_M8_ROUND13_EMPLOYEE_SCREENS.md`.


## Round 14 - service-access read audit rollout / WORM evidence

No new provider API is required to emit tenant-local immutable audit
rows. To activate and verify independent archival, the operator must
supply existing M8 `CHESS_AUDIT_*` archive gateway credentials,
allowlisted HTTPS endpoint, remote WORM receipt/retention/legal-hold
contract, and isolated secrets/vault configuration described above.
The local audit record is NOT an independently archived receipt.

A real staging pilot also requires approved fictional tenant schemas,
Clerk test owner/admin/staff and revoked identity sessions, isolated
least-privileged runtime DB role (not schema owner, not SUPERUSER),
signed retention and privacy rules, and an independently reviewed
archival failure alarm. Verify these cases:
- member without a service grant: DENY event and no resource response
- missing service link: DENY event without guessed profile/resource ID
- distinct owner/admin without an individual grant: DENY
- active granted member: ALLOW event, scoped service metadata only
- revoked grant: DENY immediately on next request
- DB audit insert/storage unavailable: fail closed, no returned link
- independent WORM exporter accepts all test events with immutable
  receipts and any failed exports are paged and reconciled

Code, unit and PostgreSQL checks cannot substitute for signed-in
E2E, archive vendor evidence, external retention approval or
a staged migration/rollback rehearsal. Full guide:
`docs/CHESS_CORP_2_M1_ROUND14_SERVICE_AUDIT.md`.
