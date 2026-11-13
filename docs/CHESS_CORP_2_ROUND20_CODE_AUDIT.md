# CHESS CORP 4 / Round 20 - Code-only milestone audit

Repository: awesso007/kobia-platform
Branch: feature/operations-overview
Draft PR: #24 (unmerged). Production main and Vercel untouched.

## Engineering work committed in Round 20

| Milestone | Additional source / code-level outcome | Release boundary |
| --- | --- | --- |
| M1 / M8-09 | Tenant-serializable, decision-audited regulated workflow and bank-review DETAIL reads. A consent/grant/membership/case recheck occurs before a result is returned. Deny decisions are recorded; audit insertion failure denies output. | Not a comprehensive all-path audit, independent WORM proof or two-tenant signed-in E2E |
| M4-04 | Recurring scheduler now cursor-pages overdue work and one-hour appointment reminders rather than selecting only the first 100 / 200 records. Each run caps at 5,000 records per stream and explicitly reports backlog as degraded worker health. | Real scheduler high-volume load tests, monitoring and paging still needed. A capped backlog needs operator intervention |
| M4-05 | Blocked work with no due date is included; current managers receive daily-deduplicated escalation for overdue items with missing/revoked assignees. No client names are sent. | Approved external email/SMS, delivery choices and employee opt-in still absent |
| M5-06 | A manual ledger-posting API now has four independent OFF-by-default operator/policy/provider release flags, exactly three independent approvers, active creator/reviewer rechecks, case/consent/grant mapping and transaction fingerprint validation, USD-only entity/bank guard, atomic legacy ledger JE+account balance+bank categorization, prior attempt audit and source-ref retry detection. Demo mode always refused. No automatic posting. | **Not certified for production.** Legacy DB transaction integration / bank-provider sandbox, staged concurrency and recovery trials, external security/legal sign-off, and resolution of remaining CHESS/legacy cross-database consent race are required. Never enable the flags for real money on source CI alone |

## Decisions that remain external or require more code

M1: Optional inter-tenant matching intentionally DEFERRED. Signed-in multi-tenant
permission tests and privacy review remain mandatory.

M2: Legal-entity identity/ownership proof, official license/firm affiliation,
employee authorization acceptance, and staging evidence missing.

M3: Approved signature vendor, real Clerk identity/consent E2E, WORM S3/KMS,
scanner real outcomes, retention release/erasure law and migration rehearsal
remain unfinished.

M4: Actual OAuth/calendar contract, provider create/status/cancel, message
delivery approvals, consent/privacy E2E, scheduler/backlog load evidence missing.

M5: Independent ledger/bank/period-close/reversal reconciliation tests, real
bank delegated access and webhook verification, payroll engine/funding/filing,
tax return preparation/e-file, provider sandboxes and signed finance controls
are **not complete**. A source-level posting function is not reconciled cash.

M6: All regulated partner adapters still require separate official registry
and firm affiliations, licensed systems, supervision and legal approvals.
No loan origination/insurance binding/real estate agency/securities trades.

M7: Contracted AI/merchant providers, billing execution, collected-cash
settlement, refunds, statutory financial consolidation/period close and
approved real financial automation are not ready. Counts and observations
must not be labeled revenue/cash.

M8: Managed secret/key rotation, independent audit WORM/retention, complete
sensitive-path audit, real signed-in two-tenant E2E, independent pen/accessibility
tests, encrypted PITR restore and measured RTO/RPO, operator pager/runbook,
protected HTTPS staging, signed release owner and cutover remain open.

## External placeholders to be supplied via a vault after review

- CHESS_BANK_POSTING_ENABLED=false (hard switch)
- CHESS_BANK_POSTING_POLICY_APPROVED=false
- CHESS_BANK_POSTING_BANK_SANDBOX_APPROVED=false
- CHESS_BANK_POSTING_OPERATOR_APPROVED=false
- Independent approved bank feed, ledger tenant/entity mapping, true human
  creator/reviewer/poster identities, legal DPA, staging URL/Clerk sessions,
  provider receipts, rollback and reconciliation evidence.
- Previous demo, M1-M8 keys and official sign-offs in
  CHESS_CORP_2_EXTERNAL_CONFIGURATION.md remain required.

## Acceptance rules

1. A GitHub CI green build does not independently prove external vendor
   settlement, e-signatures, regulator licensing or a real browser session.
2. Actual ledger posting must be left off until a representative legacy
   PostgreSQL posting/recovery/concurrency suite, authorization revocation
   races and a compliant accounting review are independently passed.
3. The CHESS demo must never be used as source of real consent, money or
   professional license verification.
4. Any unresolved external/BOTH/CODE condition remains an explicit release
   blocker. No merge, deployment, or final-complete phrase.


## Additional bounded code protections

- The tenant-only OPERATIONAL portfolio report is now a serializable
  audited read with a fresh active owner/admin check; it cannot inherit
  a stale membership from an earlier request. Denials and failures
  do not return the aggregate report.
- A bank transaction may never be categorized through this new adapter
  with an inactive bank GL, an incompatible bank account/GL type or a
  non-USD entity/bank account. Unsupported LOAN/OTHER account types are
  rejected. Actual legacy financial execution integration still needs
  real PostgreSQL and independent accounting acceptance.


## Additional Round 20 source-level ledger integration coverage

A third, isolated GitHub Actions CI job,
chess-legacy-ledger-integration, provisions an **ephemeral** PostgreSQL 16
database using prisma/schema.prisma (db push into disposable CI only).
It tests the extracted legacy bank/GL posting transaction, including:

- two-sided balanced journal and cached bank/revenue balances;
- atomic bank state UNMATCHED to CATEGORIZED plus journal ID;
- concurrent attempts for one source transaction: one winner only;
- same-source replay refusal and exactly one source journal;
- CLOSED accounting period failure rolls back the bank claim, journal
  entry and account balance changes.

The independently deployed CHESS database, official bank provider,
three live Clerk test subjects, real consent revocation races, month-end
reconciliations, long-running queue recovery, real bank statement
settlement and financial audit approval **are still NOT verified**.
Only the core legacy DB transaction can be described as CI-tested.
No finance flags may be enabled from this CI proof alone.
