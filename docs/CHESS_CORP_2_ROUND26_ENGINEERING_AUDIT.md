# CHESS CORP 2 — Round 26 engineering backlog and test audit

**Repository:** awesso007/kobia-platform  
**Branch:** feature/operations-overview, draft PR #24, **unmerged**  
**Production release:** **NOT APPROVED**. KOBIA is an independent platform; CHESS is an isolated tenant-level operations layer.

## Baseline and verification standard

Round 25 last independently observed commit
`451d9ad8ba9a5dce90e5f3cd81c689d5cdd60f8c` had **all three**
GitHub Actions jobs green:
[run 43151212356](https://github.com/awesso007/kobia-platform/actions/runs/43151212356).
Round 26 requires a **new successful complete workflow on the exact final
commit** before its CI status can be marked verified. The three jobs are
`build`, `chess-db-integration` and
`chess-legacy-ledger-integration`. No GitHub CI is a substitute for
actual vendor sandboxes, signed user sessions, DR, legal or deployment approvals.

## Round 26 source-only engineering completed

| Milestone | New committed engineering | Test evidence (must pass on final SHA) | Remaining production boundary |
| --- | --- | --- | --- |
| **M1 client profiles and permissions** | Tenant-local serializable audit/allow-or-deny gates on client profile directory, profile detail and provisioning reads; fresh current role/membership checks. Cross-business grants remain explicit. | Existing serializable sensitive-read audit failure tests, PostgreSQL append-only events and application unit/typecheck | Additional sensitive read paths still need a verified complete inventory/coverage and authenticated 2-tenant test; optional cross-tenant identity remains privacy-DEFERRED |
| **M2 business units/staff** | Business assignment removal now atomically revokes all direct client service grants for that person/business in one serializable tenant transaction, with immutable audit. Reassignment never restores prior grants; other businesses are unaffected. | Real PostgreSQL offboarding, repeat revocation, simulated reactivation and independent business-grant assertions | Real Clerk staff/role revocation and license/employer affiliation acceptance; no automatic other-tenant revocation |
| **M3 consent/onboarding/documents** | Document upload, confirmation, inventory and final download authorization now require live purpose-specific, verified, unexpired and unwithdrawn consent plus current employee service grant. List and download access decisions are recorded atomically before data/URL disclosure. | Consent/grant/withdrawal/expiry unit regressions and existing PostgreSQL immutable evidence tests | Real signed consent, e-sign vendor, S3/KMS/versioned objects/AV scanner/retention policy, immediate invalidation of already issued 60-second S3 URLs and live consent-race testing |
| **M4 work/calendar** | No new provider execution; existing recurring work, 241-appointment PostgreSQL pagination, reminders and callback guards remain | CI code tests on final SHA | Google/Microsoft delegated OAuth and actual calendar sandbox, live on-call worker fairness/backlog operational acceptance |
| **M5 accounting/bookkeeping/payroll/tax** | New strictly READ-ONLY bank source→legacy journal reconciliation, scoped audited owner/admin API and employee control. Detects UNPOSTED, exact MATCHED_POSTED two-line balanced journal, DIVERGED and UNKNOWN. Actual PostgreSQL ledger post/closed-period rollback plus new discrepancy tests. No retry, settlement, GL mutation, tax filing or payroll funding. | Legacy PostgreSQL exact source/JE/amount/account matching and mismatch/regression; bank posting still default OFF | Separate CHESS/legacy DB transactions and consent-revocation interleaving still need an independently reviewed durable reservation/outbox and crash/replay/fault injection; real bank/Plaid and payroll/tax providers plus independent finance approvals |
| **M6 four regulated services** | Preserves strict existing licensed-provider response scope and default-OFF opaque handoff. No false loan, policy, closing or trade execution | Existing gateway scope and negative tests | Four separate credentialed/contracted providers, official license/firm affiliation evidence and actual licensed execution remain external and/or provider-specific engineering |
| **M7 AI/billing/reporting** | Business financial/operational report SELECTs audited in one serializable transaction; payroll status and bank candidate access also audited. Added a versioned, nullable `lastInspectedAt` field and bounded draft-only worker fairness across consecutive invocations, including exact overflow detection (no spurious backlog on exactly 500 due plans). | Unit 550-plan/2-run fairness, 500-plan exact capacity, real PostgreSQL NULLS FIRST ordering/migration and protected operational reporting tests | Contracted invoice/payment/AI providers, real reconciliation and chargebacks, legal accounting policies, intercompany eliminations and audited statutory close; scheduler deployment/paging |
| **M8 security, audit, staging, disaster recovery** | Privacy-limited transaction-coupled sensitive read decisions expanded for document list/download, bank candidates, bank reconciliation, client profiles/provisioning, operational reports and payroll status. Fail closed when audit insert cannot commit. | Existing audited-read unit and PostgreSQL immutability tests; CI build, security smoke and generated schema | This is a **subset** of the comprehensive all-path sensitive-access audit; live external WORM receipts, pen/accessibility/load test, real 2-tenant sign-in, PITR rehearsal, staging attestation, incident pager and written go/no-go remain open |

## Open **code or combined code/external engineering** (do not mark complete)

1. **Cross-database authorization and financial attempt journaling (M3/M5):**
   CHESS service consent can be revoked in the separate tenant DB while
   the legacy GL classification transaction commits. A read-only exact
   reconciliation is now available, but it is NOT a proof of atomicity or
   a durable, independently approved authorization reservation protocol.
   Design an outbox/reservation or compensation workflow, persist unknown
   states, fault-inject power/network failures, and obtain finance review
   before live execution. Preserve source journal history.
2. **End-to-end comprehensive sensitive-read audit (M1/M8):** the added
   paths have audit coverage, but the full inventory of client-sensitive
   document, calendar, invoice, historic-report, provider callback and
   portal flows has **not** been independently exhausted and verified.
   External WORM archival, legally required retention and erasure are
   not satisfiable by code-only CI.
3. **Document consent/legal lifecycle (M3):** accurate e-signature
   semantics, versioned S3 retention/legal hold/release/deletion and
   revocation of already-issued storage URLs depend on the chosen
   counsel-reviewed policy, real object-store vendor and signed
   authorization. Do not invent legal decisions or purge records.
4. **Real provider financial and regulated execution (M5/M6/M7):**
   no provider contracts, regulator certifications, live payment
   statements, banking/payroll/tax filing, mortgage/insurance/realty/
   securities execution, or GAAP consolidation mappings are established.
   Do not replace real service operations with fictional successful
   statuses, a fake API key, or a synthetic "paid" value.
5. **Recurring worker fairness acceptance (M4/M7):** M7 now persists
   inspection timestamps to avoid starving later plans. M4 worker capped
   scans still need live volume/rotation/fairness, cron/pager and
   authenticated staging acceptance where appropriate. A 503 backlog
   remains an operational signal, not an automatic retry instruction.
6. **Full release (M8):** versioned migrations, protected real staging,
   two-tenant Clerk E2E, independent WORM receipt, live
   Postgres PITR/RTO/RPO, audited secret management and security/legal
   go/no-go remain separate tasks.

**Conclusion:** source-only scope was advanced and CI can verify
the described regressions, but **not every remaining engineering item has
been completed** and **0/8 production milestones** are independently
release-certified. Do **not** append the project-completion phrase
on the basis of this round.

## No new plaintext credentials

Use the **single** canonical owner-supply register
[CHESS_CORP_2_OWNER_SUPPLY_CHECKLIST.md](CHESS_CORP_2_OWNER_SUPPLY_CHECKLIST.md).
There are no new provider credentials just for the new M5 reconciliation
endpoint, M2 offboarding, or M7 worker timestamp. The additive
`20261111341000_chess_m7_recurring_worker_fairness` migration
must be rehearsed on a backed-up, production-like restored clone and
approved under checklist **item 16** before real tenants are migrated.
Keep all provider/regulated/finance feature switches OFF.

**One-time acceptance only:** after the last commit, record the exact
Github Actions run ID, complete/success for all three jobs, current
PR branch head and unchanged main in the Round 26 response. This
document does not claim tests have passed before the tools confirm them.
