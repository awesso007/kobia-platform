# CHESS CORP 2 — Round 32 CI/TODO review and sensitive-read hardening

**Branch:** `feature/operations-overview`; draft PR #24, unmerged.  
**Production:** `main` and `kobia-platform.vercel.app` remain untouched.  
**Platform:** KOBIA is an independent multi-tenant SaaS. CHESS is its scoped first tenant.

## Baseline and scope

The prior final Round 31 SHA `96902a15561f0d0d9e8612c7a8d29a64bdb95974` passed **3/3 normal CI jobs** in GitHub Actions run `43171848342`. There was no failing check on that latest baseline to fix. GitHub code search for branch TODO markers returned incomplete results; it is **not proof that zero TODOs remain**. This round addresses two documented, security-critical source gaps from the M1/M3/M8 full-sensitive-read audit, not a claim to have exhausted the whole KOBIA repository.

## Code-only engineering deliveries

| Area | Changed source | What is now enforced |
| --- | --- | --- |
| M1/M3 signed-in client consent | `src/lib/chess/client-consent-self-service.ts`, `sensitive-read-audit.ts` | Every verified client consent **index** and **full disclosure** query now runs in one Prisma tenant transaction with `Serializable` isolation. The ALLOW/DENY event is committed in the same transaction as the SELECT; a failure to audit prevents release of results. Verified Clerk primary email is required. Current CRM contact matching, cross-account accepted-grant visibility, and expiry logic are rechecked in that snapshot. A malformed reference generates an opaque DENY event without querying the consent row. |
| M3 privacy minimization | `client-consent-self-service.ts` | Consent **directory** queries select only metadata needed for display. Full `policyText` is selected only for a client-owned disclosure detail. Audit records contain only action, actor Clerk ID, opaque consent reference or `SELF_DIRECTORY`/`INVALID`, resource type and ALLOW/DENY; not policy text, email, profile name or amount. |
| M8 staff privacy | `src/lib/chess/worker-health.ts`, `audit-archive.ts`, `sensitive-read-audit.ts` | Tenant-wide worker and calendar metrics are now returned only after a **fresh membership/OWNER-or-ADMIN check in the same serializable audited read**. The audit archive counts share that transaction via the optional tenant transaction-client parameter. A downgraded/suspended role does not SELECT private operational metrics. |
| Negative regressions | `client-consent-read-audit-round32.test.ts`, `worker-health-read-audit-round32.test.ts` | Tests cover no email in audit event, missing/foreign contact, foreign Clerk accepted grant, empty index, >100 contact cap, invalid reference, unverified Clerk primary email, audit-storage error, concurrent role downgrade simulation, and archive read error. |

These changes do **not** enable real client e-signature, payroll/bank posting, contact sharing across tenants or owner-only dashboards for ordinary staff.

## Verification rules

Normal CI must have three **completed successful** jobs on the **exact latest commit** (`build`, `chess-db-integration`, `chess-legacy-ledger-integration`). Source, lint, typecheck, Next.js and disposable PostgreSQL passing is **not proof** of real Clerk E2E or external provider/security acceptance. Real authenticated user-role tests remain separately gated by a protected, isolated demo environment.

## Residual source and external work

The 58-route CHESS API inventory tracks route additions but does **not** prove every historical/legacy read has transaction-coupled auditing. Pending audit inspection includes provider callbacks, old document endpoints, work/billing/calendars, access revocation races and historical statements. Financial UNKNOWN outcomes still demand external/independent bank-ledger reconciliation, replay fault injection and legal finance authority. Actual staged Clerk users, two-tenant roles, accessibility tests, WORM evidence, PITR/recovery, pen/load tests and regulated provider authorizations remain open.

No new credential/configuration placeholder was required for this round. Continue using the **single 18-group** [owner-supply checklist](CHESS_CORP_2_OWNER_SUPPLY_CHECKLIST.md), particularly 01, 02, 04, 05, 07, 16, 17 and 18. Only owner-approved real-world external inputs belong there; do not place secrets in repo or chat.

**Release decision unchanged: 8/8 milestones blocked, 0/8 independent signoffs.** A green source CI cannot authorize merging draft PR #24 or deploying production.
