# CHESS CORP 4 - Round 23: M3-M7 code-only audit and release blockers

**Repository:** awesso007/kobia-platform
**Branch:** feature/operations-overview
**Pull request:** #24 (draft, not merged). No deployment or change to main.

## Recovery from interrupted Round 22

- Confirmed Round 22 actually committed through
  ecc593ab8711b34090abd9e87e96ae6c4e122caf.
- The latest Round 22 CI run failed only its build/typecheck job, because
  a direct Array.some(isUsableConsent) call passed the array index as
  the helper's Date argument. Both PostgreSQL CI jobs had passed.
- Replaced the incorrect callback with
  consents.some(consent => isUsableConsent(consent)) and verified green CI
  at the first Round 23 commit, 37b9eab839407284e200fd7457713f132bd9adc8.

## Source-only changes in Round 23

| Milestone | Actual improvement | Remaining independently required evidence |
| --- | --- | --- |
| M3 | Payroll approval requests now re-read the live business, case, client grant, service consent, financial mapping and no-existing-dispatch state inside one SERIALIZABLE CHESS transaction. Finance, regulated and invoice authorization SELECTs also include withdrawnAt so inconsistent old GRANTED-with-withdrawnAt records fail closed. | Independently certified identity, e-signature where needed, historical consent migration, S3/KMS/AV and retained legal-hold/deletion policy; no cross-database transaction guarantees |
| M4 | An isolated PostgreSQL appointment-worker regression now scans 241 eligible future appointments across bounded cursor pages, respecting the database exclusion constraint. It asserts no skipped IDs, no duplicates and explicit backlog on a capped run. | Real provider OAuth/create/status/cancel contract, employee sharing/notification approval, independently monitored scheduler and staging high-volume evidence |
| M5 | Financial-approved request and execution re-use one server-authoritative source fingerprint computed from the mapped POSTED legacy run and its amounts/date. A partial PostgreSQL uniqueness constraint prevents two PAYROLL_EXECUTE approvals for one business+source fingerprint, with migration preflight that rejects ambiguous historical duplicates; CI tests concurrent creation. Execution now requires BOTH audited source-bound request and independent approval decision events, not a legacy generic digest alone. | Independent 3-person Clerk sessions and payroll-provider funding/tax/ACH/GL/settlement acceptance, bank sandbox and cross-DB consent race resolution; all financial-provider flags remain off by default |
| M6 | Partner coordination response validation now rejects missing or mismatched tenantSlug, businessId or serviceCaseId, as well as workflow/service/partner mismatches. Pending/accepted status needs correlatable provider ID; status retries with prior ID must match exactly. Contract and negative unit tests added. | Four certified partners must supply independently scoped keys, signed official registry/affiliation sources, provider endpoints updated to echo mandatory bound scope, DPA, licensing and legal supervision |
| M7 | Recurring billing worker no longer silently processes only the first 20 due plans. It considers up to 25 bounded batches of 20, excludes already-visited and blocked plans to avoid loops, generates only DRAFTs, and returns backlog:true with an HTTP 503 degraded signal at the cap. Unit tests cover 45 denied plans, 550 due plans and default-off policy; it never charges or settles funds. | Certified invoice/merchant gateways, settled cash and refunds, approved financial/tax treatment, paid-provider reconciliation, GAAP close and legal multi-entity consolidation |

## Accepted technical boundaries / open code work

- **M3/M5:** Source resolution spans a legacy ledger and a separate CHESS
  tenant database. Even SERIALIZABLE rechecks cannot atomically protect
  live consent revocation across both databases and an external provider
  network call. An independently reviewed reservation/outbox or equivalent
  atomic revocation control, race fault-injection and signed acceptance
  remain code+external release blockers. No claim of release readiness.
- **M3:** Purge, legal-hold release and retroactive revocation of
  already-issued download URLs depend on signed retention laws and private
  object-store capabilities; these are intentionally NOT automatically
  implemented.
- **M4:** Opaque external provider status and cancellation still require
  sandbox access and signed delegated employee credentials. Provider
  synchronization never fabricates completion.
- **M5:** The new partial unique index intentionally fails migration if
  two historical PAYROLL_EXECUTE approvals share a business and source
  digest. The DB owner must inventory those records, preserve audit proof,
  obtain finance/legal direction and run a backed-up migration rehearsal.
  Never delete or rewrite approvals solely to make the deployment pass.
- **M6:** The stronger partner-acknowledgment contract is intentionally
  incompatible with old partner responses missing tenant, business and
  case IDs. Partner owners must implement and certify the new response
  contract before the independent activation flags can be enabled.
- **M7:** A bounded 500-plan billing run may return an explicit degraded
  backlog. A real scheduler, on-call monitor and correct catch-up policy
  still need staging testing. No worker automatically retries charges,
  re-sends UNKNOWN invoices or makes a settlement assertion.
- **All:** Code CI cannot substitute for a live two-tenant authenticated
  role/accessibility matrix, contracted provider sandboxes, vendor
  statement reconciliation, independent PITR/DR evidence, legal/licensed
  approvals, signed SOC/security acceptance or production authorization.

## Configuration and operator inputs (external, no secrets in Git)

1. New internal flag: CHESS_PAYROLL_APPROVAL_REQUESTS_ENABLED=false
   until finance/legal review approves exact source-bound workflow.
2. Previously existing execution flags: CHESS_PAYROLL_PROVIDER_CERTIFIED,
   CHESS_PAYROLL_EXECUTION_ENABLED, CHESS_PAYROLL_API_URL,
   CHESS_PAYROLL_ALLOWED_HOST, CHESS_PAYROLL_API_KEY, plus real signed
   independent staff roles and approved processor / tax / funding policy.
3. M6 response schema now needs explicit tenantSlug, businessId,
   serviceCaseId, workflowId, service, partnerId, status, and a correlatable
   id when pending/accepted. Configure separate
   CHESS_REGULATED_PARTNER_{SERVICE} and
   CHESS_REGULATED_PARTNER_{SERVICE}_API_KEY for each approved service,
   official registry/affiliation host allowlists and response-binding flag.
4. M7 external scheduler/plan policy gates:
   CHESS_BILLING_RECURRING_DRAFTS_ENABLED,
   CHESS_BILLING_RECURRING_POLICY_APPROVED, CHESS_SCHEDULER_ENABLED;
   the worker route must be monitored for HTTP 503 with backlog:true.
5. M3 documents and consent still need scoped sandbox S3/KMS/WORM,
   trusted scanner credentials, legal signed policy, real Clerk clients
   and CHESS_CONSENT_EVIDENCE_KEY from an approved secret vault.
6. Real Neon staging tenant/ledger mappings, pre-migration immutable
   backup, permission-restricted migration principal, DR restore trial,
   partner contracts, documented issuer of every sign-off and independent
   release-owner authorization.

**Acceptance:** All source changes require the latest commit's green
GitHub CI build, CHESS tenant PostgreSQL and legacy PostgreSQL jobs.
Review the exact run URL rather than extrapolating from an earlier SHA.
This report never marks Milestones 3-7 or the overall roadmap complete.
