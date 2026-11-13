# CHESS CORP 2 — Round 44 distributed financial-outcome fault tests

**Scope:** CHESS tenant vs. KOBIA legacy ledger, using two **disposable
PostgreSQL databases** in CI. KOBIA remains an independent SaaS and
CHESS a scoped tenant. Draft PR [#24](https://github.com/awesso007/kobia-platform/pull/24)
remains unmerged; production `main` and Vercel are untouched.

## Existing verified baseline

Round 43 final source SHA
`ab7d1f51c6c3b7d379c1207ea1348582632aa0dc` passed all three
normal GitHub Actions jobs in [run 43297225931](https://github.com/awesso007/kobia-platform/actions/runs/43297225931).
Round 38 established **six** real disposable-Postgres fault cases. Round
44 extends the **same** CI-executed suite
`src/lib/chess/distributed-financial-outcome-round38.integration.test.ts`
with **eight additional cases**. No genuine bank credentials or staged
provider accounts were accessed.

## Round 44 new fault matrix

| Test | Injected failure or collision | Safety invariant asserted on real disposable databases |
| --- | --- | --- |
| Tenant reservation ACK lost | CHESS reservation transaction succeeds, caller receives synthetic timeout, retries same source twice | Exactly one durable attempt and one RESERVED audit event; retries have the same attempt ID; no legacy journal |
| Duplicate simultaneous legacy commits | Two workers try classifying the exact same UNMATCHED bank row concurrently | Exactly one legacy POSTED journal, two balanced GL lines, single account-balance change; loser errors, no automatic UNKNOWN retry, unresolved consent stays blocked |
| Different retry identity | Same source reference with altered digest or bank transaction ID; another source reference during RESERVED | All conflicting attempts denied; one bound reservation; no GL mutation or second source reservation |
| Invalid GL offset after bank claim | Legacy bank status update succeeds inside a transaction, GL offset lookup then fails | Transaction fully rolls back claimed row, categorized pointer, journal lines and balances; tenant remains UNKNOWN until independent review |
| Bank disabled after source reservation | Bank account deactivated before the legacy classification validates the bank account | Entire legacy write rolls back; no categorized record, journal or balance change; tenant UNKNOWN |
| Reconciliation read timeout after GL commit | Simulated timeout on first outcome read; second read finds the posted journal | Unresolved attempt stays UNKNOWN, consent remains blocked, no repeated GL transaction or fictitious bank-settled claim |
| Concurrent receipt confirmations | Two tenant receipt writes race for the same verified journal after an UNKNOWN state | Idempotent final COMMITTED receipt, one committed audit event, mismatch is rejected, exactly one legacy journal |
| Replay with different source reference after posting | Second legacy commit uses another CHESS source reference on an already categorized bank row | Replay rejected; read-only conflicting source classified DIVERGED, independent review required; initial journal preserved, tenant unresolved |

These tests **add** to, not replace, the original six Round 38
cases for post-commit ACK loss, pre-write timeout, closed-period rollback,
tenant receipt timeout, reservation/start races, and consent-withdrawn
pre-execution. Total isolated cross-database cases: **14**.

## Execution and reproducibility

The existing `chess-db-integration` GitHub Actions job provisions
`chess_ci` and `chess_finance_fault_ci` as **different DATABASES on
the same disposable PostgreSQL test service**; deploys the versioned
CHESS schema and the legacy Prisma schema separately; then runs
`npx vitest run src/lib/chess/distributed-financial-outcome-round38.integration.test.ts`
with:

- `RUN_CHESS_DISTRIBUTED_DB_INTEGRATION=1`
- `CHESS_FAULT_LEGACY_DATABASE_URL` set only by CI to an ephemeral test DB
- `DATABASE_URL` pointing only to the ephemeral tenant DB

The test checks database names differ and refuses to run otherwise.
All names, amounts, people and account data are **fictional**. No
production transaction or network endpoint is invoked. The separate
`chess-legacy-ledger-integration` and `build` jobs must also pass at
the **exact final commit**. A GitHub Actions run started on an earlier
intermediate SHA is not sufficient release evidence.

## Explicit limits and owner action

This is **controlled fault injection around real persistence** in a
shared temporary Postgres service, not measured network partition or
loss of an independent bank/provider/cluster. The first simulated
reconciliation timeout represents a failed network read before a later
actual database observation, not an executed production read timeout.
No real ACH, bill-pay, mortgage escrow, payroll funding, card settlement,
tax remittance or bank statement was reconciled.

An `UNKNOWN` tenant attempt observed as legacy `UNPOSTED` or
`DIVERGED` does **not** authorize a repeat ledger write. The Round
41 owner/admin-only fourth-person reconciliation remains default-OFF.
A successfully matched POSTED journal is a **ledger entry**, not actual
bank settlement. This suite does not activate the posting, bank outcome
or payment integration flags; and it does not prove all incident,
permission/revocation, refund, reconciliation or financial-close code
paths are finished.

Canonical owner-supply groups **07 / 14 / 16 / 17 / 18** remain
OPEN for witnessed two independently operated staging clusters,
real sandbox bank vs. GL receipts, late acknowledgments, operator
roles, consent/authorization races, audit outage, immutable logging,
PITR and independent accountant/security signoff. **No new owner API
credential or 19th checklist group is required** by these source-only
tests. Details remain in the
[one consolidated checklist](CHESS_CORP_2_OWNER_SUPPLY_CHECKLIST.md).

Release count remains **8 of 8 production milestones blocked, 0 of 8
independently signed**. This is not the all-code-roadmap completion
condition.
