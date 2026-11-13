# CHESS CORP 2 — Round 33 fictional demo usability audit

**Branch:** `feature/operations-overview`, draft PR #24. **Production is unchanged.**
KOBIA remains an independent SaaS platform; CHESS is an isolated tenant.

## What was weak, and what was changed

| Journey | Problem | Round 33 improvement |
| --- | --- | --- |
| Staff member who manages Insurance but only supports Bookkeeping | Finance menu could open the alphabetically first visible unit (Bookkeeping), where the employee lacked manager access. Overview showed the ordinary staff menu despite real manager responsibilities. | Added `listChessManagedBusinessUnits` based on active tenant membership and unrevoked `MANAGER` assignments. Service-desk finance links deep-link to the first actual managed unit; other managed units appear in the finance selector. Overview shows unit-specific manager tools without exposing tenant-wide OWNER/ADMIN metrics or security administration. |
| Invalid, revoked or copied business links | Pages silently opened the first accessible business, potentially displaying or submitting a form in an unintended company. | Shared `selectChessWorkspace` fails closed for an explicit invalid ID. Updated work items, finance, bank exception monitoring, regulated services, action approvals, business administration and billing to show a clear unavailable/next-step state instead of switching the user to another business. An omitted business ID still opens the first *authorized* unit for a normal landing. |
| Switching business tabs | Several client components retained React state from the previous company, including task status, alerts, recurring templates, appointments, billing plans, action review forms, bank feeds and employee admin. | Added business-ID React keys to remount per-business components, resetting local state when the selected unit changes. This is presentation protection only; the API must continue to enforce all permissions. |
| Task/notification loading failure | `listChessWorkItems` and `listChessEmployeeAlerts` errors were replaced with empty arrays, misleading staff into believing no assignments or alerts existed. | Failed reads now render an error state, do not show old/private rows and provide a workspace reload action. True empty queues explain that other teams may still have work and that the employee may contact a manager. More precise 403/409 update error messages. |
| Calendar consent availability | A failed status read defaulted to `enabled:false`, falsely showing calendar sharing as OFF. | Status read failures now render an explicit error without rendering On/Off controls, preserving consent accuracy; OAuth connection controls are withheld until the status is verified. |
| Manager scheduling | Creating recurring work required typing a raw Clerk user ID, impractical for a manager. | Replaced it with a named, business-authorized employee selector sourced from the existing manager-scoped staff directory, with an explicit unassigned option. Empty recurrence/manager assignment states explain the next step. |
| Demo workflow boundaries | Employees could see links to workspaces they could not administer, and users lacked clarity on why a finance case list is empty. | Staff and managers now see appropriately scoped links; finance-case empty state describes the required case, individual service grant and current client consent. No provider action or real financial/regulated work was enabled. |

## Tests and verification

- `src/lib/chess/demo-navigation-round33.test.tsx` tests explicit invalid business selection, current manager-only assignments versus staff and suspended membership, owner/admin menus, the recurrence employee selector, and actionable task empty state.
- `src/lib/chess/demo-ui-source-round33.test.ts` prevents regression from error-to-empty substitutions, false calendar OFF status, missing keyed business-local UI, missing revoked-link checks or a mixed manager/staff menu.
- Final CI verification requires **three completed, successful** jobs against the *latest SHA*, including lint/typecheck/unit/build, disposable tenant PostgreSQL, and legacy ledger PostgreSQL. Intermediate red jobs against superseded commits are not sufficient evidence of failure or success at the final SHA.
- Existing `e2e/chess-demo.spec.mjs` covers OWNER, MEMBER/SUPPORT, verified CLIENT and unauthenticated role boundaries, but **signed-in browser execution and real keyboard/screen-reader acceptance are not verified by normal CI**. Item 01 of the single owner checklist defines the isolated Clerk/Neon inputs needed. A real manager-vs-SUPPORT browser role-change test must be run in that protected setup before release.

## Still incomplete

The round does not fix every TODO in KOBIA or complete all-source sensitive read audits, distributed financial UNKNOWN reconciliation/fault injection, real bank/payroll/provider receipts, client e-sign, staging/DR/WORM proofs or independent security/accessibility approvals. Normal CI green is engineering verification, not live tenant acceptance. The canonical owner-supply checklist remains `docs/CHESS_CORP_2_OWNER_SUPPLY_CHECKLIST.md`, with **no new provider secret introduced** in this round.

**Release:** 8/8 milestones production-blocked and 0/8 independent release approvals. Never merge draft PR #24 or deploy to production as part of Round 33.
