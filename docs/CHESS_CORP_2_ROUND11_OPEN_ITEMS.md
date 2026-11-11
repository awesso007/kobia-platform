# CHESS CORP 2 - Round 11 verified outstanding roadmap register

**Scope:** Milestones 1-8, reconciled against
`docs/CHESS_CORP_2_ROADMAP.md` through Round 10 and the recorded
development implementations. The original milestone summaries at the
top of the roadmap are historical and often superseded by later
implementations; this register must not count those twice.

**Status legend:** `CODE` = meaningful engineering work still missing;
`EXTERNAL` = provider credential, account, human verification or
deployment evidence cannot be satisfied by a Git commit alone;
`BOTH` = additional code plus external evidence. `DEFERRED` =
a future feature that must not be assumed safe or required without
a separately approved cross-business legal/data policy. No task is
marked production complete by green CI.

## Milestone 1 - Unified client profile

- **M1-01 [DEFERRED]** Optional privacy-preserving cross-KOBIA-tenant
  person identity reconciliation is not implemented. Cross-tenant
  matching must NOT occur automatically. Requires explicit, documented,
  legal client identity/permission model if it is ever added.
- **M1-02 [BOTH]** Complete cross-business client-record and
  service-grant access validation with real signed-in tenant and
  business fixtures. Round 14 implements atomic ALLOW/DENY service-link
  read auditing and adds unit/PostgreSQL regressions; earlier
  GRANT/REVOKE events remain. Still require every other sensitive
  access-path audit, remote WORM evidence, two-tenant signed-in E2E,
  privacy and accessibility approvals.
- **M1-03 [EXTERNAL]** Obtain independent legal/privacy approval for
  shared profile visibility and permitted information sharing across
  distinct CHESS operating entities.

## Milestone 2 - Business units and employees

- **M2-01 [EXTERNAL]** Establish independent legal-entity identity,
  beneficial ownership, company formation and the true business-unit
  to legal-company ownership mapping; a label is not a legal entity.
- **M2-02 [BOTH]** Complete formal verification of relevant role,
  professional credential, license and active employee assignments
  against authorized systems, with revocation/renewal evidence and
  signed-in permission regression.
- **M2-03 [EXTERNAL]** Independently review employer, broker and
  registered-firm affiliations before an employee can perform a
  service requiring those relationships.

## Milestone 3 - Client onboarding, consent and documents

- **M3-01 [BOTH]** Deploy and independently validate the new
  dedicated, default-off, identity-scoped consent dashboard and
  disclosure/withdrawal UX with real fictional signed-in clients.
  Development UI and verified-email record filters exist as of Round 12,
  but external identity/policy approval, browser accessibility testing,
  legal e-signatures where required and actual multi-tenant E2E
  are not complete. A full consent/document portal needs further work.
- **M3-02 [BOTH]** Integrate an approved signature/e-sign/evidence
  provider where legally required, independently verify provider
  provenance and obtain legal approval for the signed text.
  HMAC acceptance metadata is NOT a legal e-signature.
- **M3-03 [EXTERNAL]** Provide approved private S3 bucket/KMS,
  encryption, versioning, retention, object-lock policy as applicable,
  isolated scanner/ClamAV credentials and real CLEAN/INFECTED
  sandbox outcomes; code alone cannot activate storage.
- **M3-04 [BOTH]** Complete document retention/deletion/legal-hold
  policies and operational revocation workflows for already
  delivered/externally shared information. No assumption of
  automatic external cancellation after client withdrawal.
- **M3-05 [EXTERNAL]** Supply a strong consent-evidence signing key
  from a managed vault, historical key-rotation verification plan,
  independent policy approval and any external identity/evidence
  provider credentials.
- **M3-06 [BOTH]** Apply and rehearse the Round 11
  `20261111334000_chess_m3_consent_evidence_integrity` migration
  on each authorized tenant with a backup, read-only legacy-evidence
  inspection and independently approved reissuance of malformed
  or unverifiable historical consent records.
- **M3-07 [BOTH]** End-to-end verify client grant, version display,
  withdrawal, expiry and downstream finance/regulated authorization
  fail-closed behavior using real fictional signed-in sessions.

## Milestone 4 - Internal operations, calendar and scheduling

- **M4-01 [EXTERNAL]** Contract/configure the real calendar gateway
  with allowlisted create/status/cancel HTTPS URLs, scoped token,
  employee Google/Microsoft delegated OAuth and appointment-specific
  sharing authorization. All gateway activation flags remain off.
- **M4-02 [BOTH]** Complete user-facing provider OAuth connection/
  renewal/revocation UX and verify both independent task-calendar
  and appointment-calendar permissions with employee accounts.
- **M4-03 [BOTH]** Run actual fictional vendor create/status/cancel
  sandbox and asynchronous reconciliation tests, including
  UNKNOWN/CANCEL_UNKNOWN, consent race, webhook/status semantics
  and no-blind-resend behavior.
- **M4-04 [BOTH]** Deploy the isolated tenant-allowlisted scheduler
  and test operations monitoring, stale heartbeats, failure alerts,
  queue paging/batching and high-volume recurrence behavior.
- **M4-05 [BOTH]** Finalize non-in-app staff communication choices
  (optional email/SMS), delivery/overdue escalation policies and
  any external communication provider consent/retention policy.
- **M4-06 [BOTH]** Verify employee-facing privacy copy, calendar
  data retention, cancellation/deletion behavior, service-access
  controls and production-like staging sign-off.
- **M4-07 [DEFERRED]** If the same professional is scheduled across
  independent KOBIA tenants, define a lawfully shared, minimally
  identifying conflict service. Current exclusion locks are intentionally
  limited to one tenant; do not silently aggregate tenant calendars.
- **M4-08 [BOTH]** Observe real appointment-to-calendar delivery;
  local appointment collision protection and internal outbox code
  are implemented, but not externally provider-confirmed.

## Milestone 5 - Accounting, bookkeeping, tax and payroll

- **M5-01 [BOTH]** Validate a production-grade, balanced KOBIA
  general ledger with real approved entity/COA mapping, matched bank
  sources, journal posting/reversals and independent reconciliation
  and final review. Current CHESS bridge is largely read-only.
- **M5-02 [BOTH]** Contract and configure the real Plaid (or approved)
  bank connection: verified bank-feed consent, scoped credentials,
  signed webhooks, incremental pagination and backfill, duplicate/
  replay and disconnect processing, retention, and sandbox evidence.
- **M5-03 [BOTH]** Integrate a certified payroll processor with
  tested wage/tax calculation, employee enrollment, funding
  segregation, ACH release, disbursement, payroll tax filings,
  state/federal remittances and independently reconciled settlement.
  Provider acknowledgment is not bank settlement.
- **M5-04 [BOTH]** Integrate professional tax-preparation and filing
  systems with PTIN/EFIN/client authorizations as applicable, reviewed
  calculations, actual federal/state e-file receipt, reject/retry
  handling, retention and segregation of duties.
- **M5-05 [BOTH]** Run finance/bank/payroll/tax provider sandboxes,
  real employee grants/consent-revocation role E2E, reconciled
  ledger tests, backed-up staged migrations and service-specific
  security/privacy/compliance approval.
- **M5-06 [CODE]** Implement any missing production reconciliation/
  posting execution bridges behind provider and independent approval
  gates rather than relying solely on internal review metadata.

## Milestone 6 - Regulated service coordination and execution

- **M6-01 [EXTERNAL]** Contract and independently validate appropriate
  official registry coverage for NMLS/mortgage, DOI/insurance,
  DRE/real estate and securities/investments (CRD/IARD/FINRA/SEC
  as applicable), including jurisdiction-specific expiry and
  historical verification evidence.
- **M6-02 [EXTERNAL]** Independently confirm firm sponsorship,
  licensed individual eligibility, legal entity/broker/employer
  affiliation and retained practitioner/firm audit evidence.
- **M6-03 [BOTH]** Obtain service and external-handoff specific signed
  disclosures, customer consent provenance, cancellation and
  retention/incident policies acceptable to regulators and partners.
- **M6-04 [BOTH]** Supply four appropriately approved partner IDs,
  delegated credentials and provider endpoints. Run fictional
  create/status/uncertain/revocation/retention sandbox tests
  with signed DPAs and no accidental regulated financial execution.
- **M6-05 [BOTH]** Connect separate licensed systems for actual
  mortgage origination/disclosures, insurance quoting and binding,
  real-estate agency/offers and investment suitability/supervision/
  trading. The existing opaque partner handoff does none of these.
- **M6-06 [EXTERNAL]** Complete firm-specific legal review,
  responsible licensed supervision, staging role/penetration checks,
  vendor agreements and approval before regulated live records.

## Milestone 7 - AI automation, invoices and financial reports

- **M7-01 [EXTERNAL]** Approve a contracted AI-only HTTPS provider,
  allowed host, scoped credentials, privacy/DPA, purpose-bound
  minimal data-sharing approval, model retention and cost controls;
  verify real (fictional) provider response in protected sandbox.
- **M7-02 [BOTH]** Any AI advice beyond the implemented generic,
  independently reviewed task triage requires a separate validated
  financial/regulated action model, human approval and extensive
  security/compliance validation. No automatic filing, trade, ACH
  or ledger alteration is currently approved.
- **M7-03 [EXTERNAL]** Contract/configure invoice-only delivery
  provider, verified external billing-contact mapping, specific
  billing consent, approved fees/tax/retention policy, DPA, three
  independent staff members and a noncharging vendor sandbox.
- **M7-04 [BOTH]** Implement and verify an actual merchant billing/
  subscription and collection subsystem: signed payment webhooks,
  refunds/chargebacks, receivables settlement reconciliation,
  tax handling, idempotent approved GL postings and merchant
  underwriting. Current module is draft/delivery only.
- **M7-05 [BOTH]** Implement historical period-close reports and
  reviewed multi-entity financial consolidation, intercompany
  eliminations, accurate cash/bank reconciliation, earnings
  recognition, audit evidence and independent report sign-off.
  Current portfolio reports sum operational counts and face values.
- **M7-06 [EXTERNAL]** Run real fictional AI/billing/provider sandbox
  contracts, approved tenant worker, independent approval/consent
  races, deployment monitoring and external release acceptance.

## Milestone 8 - Security, quality, operations and release

- **M8-01 [BOTH]** Back up, deploy and reconcile all additive
  tenant-schema migrations across every intended existing tenant;
  rehearse old-application/new-schema rollback compatibility on a
  production-like restored clone and record an independent sign-off.
- **M8-02 [EXTERNAL]** Contract and evidence independent WORM audit
  archive service, signed DPA/retention/legal-hold guarantees,
  vault-held pseudonymization keys and historical rotation rules;
  run a protected fake-event create/status/receipt sandbox.
- **M8-03 [EXTERNAL]** Provision real encrypted PostgreSQL PITR and
  immutable versioned object backups; complete an isolated restore
  drill with independently measured RTO/RPO, app startup, privacy,
  triggers, audit witnesses, ledger/record reconciliation and
  independently signed operator evidence.
- **M8-04 [EXTERNAL]** Run the protected authenticated two-tenant,
  two-business, three-user end-to-end test matrix using separately
  deployed fictional tenant apps, Clerk sessions, live/withdrawn
  consent evidence, cross-tenant/CSRF test fixtures and a signed report.
  CI currently verifies the harness and synthetic regressions only.
- **M8-05 [EXTERNAL]** Finish independent penetration test,
  authenticated browser/role audit, real accessibility audit
  (keyboard/screen readers), realistic load/stress testing,
  security remediation and retest.
- **M8-06 [BOTH]** Complete managed vault and separate least-privilege
  database/runtime roles, rotation/revocation of consent, audit,
  Clerk, provider and storage credentials, old-key preservation,
  hard deletion/legal-hold workflows and a signed retention matrix.
- **M8-07 [EXTERNAL]** Enable managed repository secret scanning and
  push protection and independently audit software dependencies;
  remediate high/critical production package findings and document
  review of alerts. CI's basic pattern scanner is not sufficient.
- **M8-08 [BOTH]** Complete operations observability: paging,
  on-call incident ownership, key/event-export failures, retries,
  retention/deletion monitoring and incident rehearsal. A status
  dashboard and draft runbook are not an approved alert response.
- **M8-09 [BOTH]** Audit all sensitive access and denied requests
  with privacy-limited provenance, verify WORM export integrity
  under independent retention and deletion policies. Round 14
  covers service-link ALLOW/DENY/missing-link decisions atomically
  and verifies their database immutability, but other sensitive
  service reads, actual remote archival receipts, infrastructure
  least-privilege, retention/erasure and signed-in staging E2E
  remain unresolved.
- **M8-10 [EXTERNAL]** Deploy actual private HTTPS staging on the
  reviewed SHA, separately inject the build attestation token and
  confirmed release SHA, supply real DB/S3/ClamAV sandbox credentials,
  run the protected staging configuration/dependency/migration/build
  checks and record results. The workflow itself does not deploy.
- **M8-11 [EXTERNAL]** Independently approve backup/rollback,
  contracts/provider sandboxes, staff permissions, accessibility,
  security, privacy, signed consent, employment/licensing, and
  retention policies; name the actual authorized release owner.
- **M8-12 [EXTERNAL]** Supervised production cutover with
  separately approved scope and credentials, staged migration,
  disabled-by-default regulated integrations, monitored pilot,
  release freeze, rollback plan and signed go/no-go. No merge
  or deployment is authorized by development CI alone.

## Round 11 highest-priority code-first item

**Consent evidence integrity** is the selected highest-priority *code-only*
risk because later service authorization, bank data, financial review,
payroll and regulated workflows depend on authentic purpose-bound
records. Implemented by this round:

- Versioned PostgreSQL trigger rejects direct granted inserts,
  missing grant evidence, policy/identity edits, evidence tampering,
  invalid reversions and deletion of consent records; reissuing a
  disclosure requires a new consent row.
- Both administrative consent-request and consent-withdrawal operations
  now commit corresponding immutable security events atomically
  with their state changes.
- Service access rejects malformed/legacy-shaped SHA-256 evidence fields.
- PostgreSQL and unit regressions exercise valid pending/granted/
  withdrawn lifecycle and direct SQL-layer tampering rejection.

**Still NOT closed:** provider-backed legally sufficient signatures,
client portal/accessibility/identity E2E, historical key management,
actual third-party revocation, real signed-in staging verification,
application DB role restrictions and independent consent legal review.
The database migration must be applied under an approved rollout after
reviewing the history of existing consent records; no migration may
manufacture evidence for legacy clients.
