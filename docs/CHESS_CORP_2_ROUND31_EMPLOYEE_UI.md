# CHESS CORP 2 — Round 31 employee UI and server-read audit

**Scope:** branch `feature/operations-overview`, draft PR #24. KOBIA remains an independent multi-tenant SaaS; CHESS is only an isolated operating tenant. **Production `main` and Vercel are unchanged.**

## Screen gap audit

The existing Round 27 inventory already provides employee or administrator screens for profile provisioning, consent, scanned documents, staff/business assignment, appointments, work items, manager queues, finance cases, bank classification/reconciliation, payroll approvals, tax workpapers, regulated coordination, AI, invoices, recurring billing, operations reporting, archive/security oversight and staff calendar consent. The 58-route CHESS API manifest from Round 29 is a security inventory, not evidence that every endpoint is safe or needs a UI.

Two source-backed gaps remained after Round 29:
- The new durable M5 `ChessFinancialAttempt` reservation/EXECUTING/UNKNOWN/COMMITTED/FAILED/CANCELLED states had **no dedicated employee-facing exception monitor**. Existing authorized case-level reconciliation was available only after navigating to an approved bank review.
- M4 `ChessWorkRecurrence.lastInspectedAt` was persisted by the fairness worker but **not exposed in the employee recurrence list**. A blocked due template could look as if no worker had examined it.

## Round 31 delivery

| Who | Route | Capability | Safety and authorization |
| --- | --- | --- | --- |
| Active owner/admin or currently assigned business MANAGER | `/app/financial-attempts` | Read-only six-state status cards, last 25 status/time rows, oldest unconfirmed reservation age and independent reconciliation warning | Manager assignments are checked before listing business links; `getChessFinancialAttemptHealth` repeats role, active unit and assignment checks **inside a serializable audited database transaction**. Returns no client names, source IDs, account numbers, money amounts or ledger receipts. No POST, retry, settle or force-mark buttons. |
| Active business manager (including assigned MEMBER/MANAGER), or owner/admin | `/app/chess-desk` | Business-manager-only links to authorized finance workbench and read-only financial attempt monitor | Ordinary SUPPORT employees do not see manager links. MEMBER/MANAGER does **not** receive unrelated owner/admin workspaces such as security administration. |
| Active manager with authorized unit | `/app/work-items` | Recurrence entries show real last worker inspection timestamp (UTC) or `Never inspected` | Read uses existing manager-scoped audited recurrence directory; display explicitly notes inspection does not prove a work item was generated. Worker run endpoints remain machine-only. |
| Finance manager | `/app/finance-operations` | Direct link to the read-only attempt monitor for the selected business | Finance case review retains its existing active-case, service-grant, and accepted-consent checks; no new financial posting permission. |

## Verification and outstanding evidence

- Unit tests cover count mapping across all six statuses, privacy-minimal SELECT shape, transaction-coupled ALLOW/DENY audit, manager vs SUPPORT/revoked role denial, and the monitor's explicit no-retry/no-settlement warning.
- React static render regressions cover UNKNOWN and empty monitor states, last-inspected/never-inspected recurrence labels, and manager-only navigation.
- Normal CI verifies lint, typecheck, app build, unit tests and disposable tenant/legacy PostgreSQL, **but does not run authenticated Clerk browser/axe acceptance** without the isolated setup in canonical checklist 01.
- External dependency **unchanged**: owner-supply checklist 06 requires deployed worker/paging and test evidence; checklist 07 requires independent reconciliation, approved bank/GL mapping, operator identity separation, and finance signoff; checklist 16 requires migration/DR evidence; checklist 17–18 require staged auth/security/privacy/accessibility approvals. No new secret was introduced.
- **Still missing:** all-path legacy sensitive-access audits, actor-approved historical bank UNKNOWN resolution and real double-write fault injection, actual provider receipts and independent finance review, private staging/DR/WORM evidence, Clerk role-revocation browser acceptance, security/load/accessibility signoff. These are not marked complete because the UI is available.

### Machine-only and regulated boundaries kept closed

Scheduled recurrence and billing jobs, payroll status callbacks, calendar sync, AI triage workers, scan callbacks, merchant webhooks, incident monitoring, audit archive, staging attestation, live payroll funding, tax e-filing and regulated service execution are **not** exposed as employee execution controls. No fictional receipt is treated as settlement.

**Production release: 8 of 8 milestones blocked; 0 of 8 independently signed off.** Never merge draft PR #24 or deploy `main` as part of this round. This is a screen coverage improvement, not completion of all roadmap code or release gates.
