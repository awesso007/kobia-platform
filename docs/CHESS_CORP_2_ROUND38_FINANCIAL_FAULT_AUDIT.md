# CHESS CORP 2 — Round 38 distributed financial outcome fault audit

**Repository:** `awesso007/kobia-platform`  
**Development branch:** `feature/operations-overview` (draft PR #24)  
**Production:** `main` and `kobia-platform.vercel.app` unchanged; no merging or deployment authorized.  
**Boundary:** KOBIA remains independent, with CHESS as a separately scoped tenant.

## Baseline verified after the interrupted Round 37 session

The actual Round 37 head was
`a02d778abd501c104a4845339cb1f142494222d0`;
[GitHub Actions run 43277957939](https://github.com/awesso007/kobia-platform/actions/runs/43277957939)
completed **3/3 successful** after the Next build's isolated CI heap increase.
Draft PR #24 remained unmerged. This baseline does **not** certify all
162 historical API routes or authorize financial execution.

## Round 38 engineering scope

New integration suite:
`src/lib/chess/distributed-financial-outcome-round38.integration.test.ts`.

The `chess-db-integration` CI job provisions an **additional disposable
PostgreSQL database** `chess_finance_fault_ci` for the legacy KOBIA
accounting schema, separate from the disposable CHESS tenant `chess_ci`.
The test opens two Prisma clients against two different database names and
exercises the real durable CHESS attempt, consent-lock and legacy journal
classification/reconciliation implementations. Both databases exist only
inside GitHub's isolated PostgreSQL service container. This is an honest
source/integration simulation; it is not a production two-provider drill,
and the databases are not physically separate clusters.

### Fault matrix

| Scenario | Injected fault or race | Required verified invariant |
| --- | --- | --- |
| Lost legacy commit acknowledgment | Commit a real, balanced journal in legacy DB; simulate timeout before acknowledging to CHESS | CHESS attempt becomes UNKNOWN, a write replay is rejected, read-only source reconciliation locates the single journal, a verified receipt may pin it once |
| Timeout before legacy call | Leave legacy database untouched after CHESS starts EXECUTING; mark ambiguous outcome | No journal or account balance mutation; UNKNOWN cannot auto-resubmit; client cannot withdraw consent until independent resolution |
| Partial ledger failure | Close a legacy accounting period, then attempt classification | Entire bank claim, journal and account-balance writes roll back; CHESS stays UNKNOWN, with no false success |
| Tenant receipt outage after legacy success | Commit source journal but interrupt before CHESS receipt write | Original EXECUTING/UNKNOWN keeps withdrawal blocked; source journal evidence can later be pinned; no automatic new source write |
| Concurrent duplicate request | Race identical durable reservations and EXECUTING transitions in serializable CHESS database | One durable attempt, one execution start, at most one posted legacy journal; expected serialization conflicts are not treated as successful payments |
| Consent withdrawn pre-execution | Cancel a RESERVED attempt with locked consent withdrawal | Terminal CANCELLED; start and re-reservation rejected, no legacy mutation |

The suite is opt-in **only** under isolated CI:
`RUN_CHESS_DISTRIBUTED_DB_INTEGRATION=1` and
`CHESS_FAULT_LEGACY_DATABASE_URL`, which is a **test-only disposable
database connection**, not a provider credential. CI owns this connection.
No additional owner credential, partner API, or banking authorization is
needed for this source-only work.

## Deliberate limits

- Faults are controlled simulations of timing and lost receipts around real
  PostgreSQL writes; not actual network partitions between independently
  operated clusters. External bank settlement is never tested or claimed.
- A source reconciliation result of UNPOSTED while CHESS state is UNKNOWN
  does **not** authorize automatic retry. An independent, audited resolution
  protocol remains a code/release gap.
- A source MATCHED_POSTED receipt is a verified **ledger** journal, **not**
  evidence of an actual bank settlement, ACH wage disbursement, tax filing,
  invoice collection, insurance binding or regulated trade.
- The CI job does not activate any CHESS posting flags and uses fictitious
  accounts, amounts, users and consent evidence. No live money can move.
- Protected staging fault tests are still required for distinct Clerk roles,
  changed/revoked consent, failed audit storage, inter-tenant isolation,
  real PITR/DR and independent reviewer sign-off.

**Required owner evidence** remains under canonical checklist groups
**07** (bank/provider and three-person authorization),
**14** (accounting policy and reconciliation),
**16** (backup and restore),
**17** (protected two-tenant staging and isolated provider sandboxes), and
**18** (independent security/finance and final go/no-go).
Do not add a duplicate checklist or imply these groups are satisfied.

**Release:** all 8 milestones still production-blocked; 0/8
independently approved. Round 38 final CI must be confirmed against its
**exact last SHA** before calling this source test increment CI-verified.
