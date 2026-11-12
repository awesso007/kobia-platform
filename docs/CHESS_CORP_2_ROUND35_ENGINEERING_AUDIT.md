# CHESS CORP 2 — Round 35 engineering backlog closure and limits

**Source branch:** `feature/operations-overview`, unmerged draft PR #24.  
**KOBIA boundary:** CHESS remains one tenant of independent KOBIA; this is
not a cross-company shared licensed operating entity.  
**Production:** Do not modify `main`, activate real provider switches,
merge PR #24, or deploy as a consequence of ordinary CI.

## Round 35 code-only implementation

| Milestone | Code and security improvement | Test and engineering boundary |
| --- | --- | --- |
| **M1, M2, M8** | `listBusinessUnits` now uses fresh membership and assignment filters inside one serializable, tenant-local ALLOW/DENY audit transaction. Directory overflow is explicit, not silent truncation. | New negative tests cover stale VIEWER role, user-specific unit filter, overflow and audit outage. Does not prove all historic CHESS/KOBIA directory endpoints are covered. |
| **M2, M8** | `getChessBusinessAssignmentAdmin` now couples staff-directory SELECT and fresh OWNER/ADMIN/unit checks to the source audit. `createBusinessUnit` and `assignEmployee` now recheck current roles, target membership and active unit inside serializable mutation transactions with append-only source events. | Role-revocation, suspended target, inactive unit and audit-failure tests. No real corporate licensing/employee identity evidence supplied. |
| **M1, M8** | Client profile creation, service-link provisioning, grant assignment and grant revocation now recheck tenant role/business/target state in serializable write transactions and append the relevant audit event before returning. | Negative tests cover a revoked admin and failed immutable audit. Old client-service grants, historical source paths, e-sign and full external audit archive remain unapproved. |
| **M6, M1, M8** | Replaced the unlogged broad SELECT and per-case out-of-transaction grant filtering on the regulated service page with `listChessAuthorizedRegulatedCases`. Current staff assignment, client-profile ownership, service grant, accepted consent and audit are checked in one tenant snapshot. The browser only receives opaque case ID and service. | Unit tests cover foreign client, revoked grant/employee, pending consent, no private details in response or audit, and audit writer outage. No license or regulated execution capability is activated. |
| **M7, M8** | AI suggestion directory, AI provider-call budget, and tenant AI worker-status reads now use transaction-coupled, current-role audited SELECTs. Review button eligibility reflects the membership role inside that transaction. | Unit tests cover role downgrade, member manager vs owner, empty worker history and failed audit. No AI provider approval or external provider call is unlocked. |
| **M7, M8** | Employee approval inbox is now manager/staff filtered and audited in one transaction. It does not serialize creator/reviewer Clerk IDs merely to show action buttons. | Tests cover owner-vs-staff visibility, revoked assignments, role downgrade and audit outage. No financial or regulated execution button was added. |
| **M7, M1/M2** | AI, operations-intelligence and monthly-reports pages no longer silently switch to a different business when an explicit business ID is unavailable; business-scoped reporting forms remount when the unit/month changes. | Unauthorized deep link now shows a safe unavailable state; API authorization remains the ultimate boundary. Real authenticated multi-business browser acceptance remains pending. |

These are scoped fixes, **not** proof that every engineering gap is closed.
No external secrets, vendor endpoints or production feature flags were
needed or modified to commit the source/test changes.

## Mandatory verification at the exact final commit

The three **normal CI** jobs must all have `completed/success`:
`build` (lint, typecheck, unit, Next build, HTTP security smoke),
`chess-db-integration` (disposable tenant PostgreSQL), and
`chess-legacy-ledger-integration` (disposable legacy PostgreSQL).
All CI failures on superseded commits must be corrected and the final
exact SHA independently checked. Green normal CI does **not** execute the
separately protected, genuine Clerk signed-in browser suite or prove
real vendor/wage/ledger/consent/DR behavior.

## Work not honestly complete

- **M1/M8 code-only:** exhaustive human-reviewed source-to-sensitive-read
  audit for every CHESS and legacy KOBIA endpoint, concurrent authorization
  denial tests beyond the selected transaction-coupled paths, and independent
  external WORM/pager delivery receipts.
- **M3 code + counsel/provider:** independently approved client e-signature
  and retention/hold release/erasure lifecycles; real private storage scanner
  and issued URL revocation checks; historical data inventory and restore.
- **M4 code + external:** authentic delegated calendar consent/revoke/cancel
  and active worker/backlog/incident drills, tenant-specific real sessions,
  complete accessibility on all employee screens.
- **M5 code + external:** full distributed source/legacy-GL
  EXECUTING/UNKNOWN fault injection, authorization and consent race
  reconciliation, certified payroll/bank/tax providers, financial settlement
  proof, independent accounting and licensed signoff.
- **M6 code + external:** source-verified live license/firm affiliations,
  four licensed partners with regulatory contract scopes and signed disclosures.
  Opaque handoffs are not origination, policy binding, closing or trading.
- **M7 code + external:** real invoice/merchant reconciliation and refunds,
  approved AI vendor with privacy/cost evidence, statutory GL close,
  intercompany eliminations and independent financial-statement signoff.
- **M8 external and code found during staged testing:** two private HTTPS
  tenant staging origins, actual Clerk roles and client consent, cross-tenant
  penetration and keyboard/a11y tests, real WORM/PITR witness, capacity
  and operational paging proofs, authorized migration/rollbacks, signed go/no-go.

**Release accounting:** 8/8 milestones remain **PARTIAL CODE /
PRODUCTION BLOCKED**, 0/8 have independently signed release acceptance.
The one canonical owner-supply register is
[the 18-group checklist](CHESS_CORP_2_OWNER_SUPPLY_CHECKLIST.md).
Do not declare the whole CHESS CORP 2 build complete based on this round.
