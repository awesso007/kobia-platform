# Round 9 - Milestone 7 implementation and acceptance

KOBIA remains independent multi-tenant software; CHESS business units operate
only in their explicitly resolved KOBIA tenant. All instructions below refer
to development code in `feature/operations-overview`, PR #24. They do not
authorize the use of real client, health, financial or regulated data.

## User-facing pages

1. `/app/ai-operations` selects an assigned business, shows structured
   AI task triage suggestions, review queue totals, independent acceptance
   or rejection, and separately authorized creation of a generic follow-up.
   The AI provider receives status, due bucket and assignment presence only.
   An accepted recommendation cannot edit its original work item.
2. `/app/service-billing` selects a business and only displays cases
   with current client service and billing consents plus caller-specific
   write grants. Drafting, independent review, separately authorized
   submission, read-only vendor status reconciliation, and a pre-delivery
   audited VOID state are available. Provider payment/settlement is NOT.
3. `/app/operations-reports` displays a selectable UTC month,
   per-business status counts, and portfolio totals. Separate JSON/CSV
   exports are available. Portfolio visibility requires an ACTIVE tenant
   OWNER/ADMIN and never combines data across KOBIA tenants.
4. `/app/operations-intelligence` retains the existing combined overview
   with links to the three focused workspaces. The original CRM sidebar
   also links to each focused screen.

## New backend safeguards

- Billing VOID requires a live billing grant, valid consent, an unsent
  DRAFT/APPROVED/REJECTED status, an exact record version, and an
  independent authorized actor when a draft was previously approved.
  SUBMITTING/SENT/UNKNOWN are not voidable because remote delivery may
  already have occurred. VOID creates an append-only audit event and
  never contacts a vendor.
- Approval and delivery actions in the UI are generated from the current
  active manager's role and author/reviewer separation. Backend checks
  remain authoritative; hiding buttons is not the security boundary.
- Aggregates export exact USD cents without floating-point rounding and
  protect CSV values from spreadsheet formula execution.
- Existing per-tenant/per-user PostgreSQL quotas apply to AI, billing and
  report endpoints; the rate guard fails closed.
- A successful signed-in tenant session is required. Anonymous HTTP smoke
  tests cover new portfolio exports and CSRF-denied AI/VOID mutations.

## Test matrix

Automated CI: lint, typecheck, Vitest policy/provider/format tests,
PostgreSQL migrations and integration tests, production compilation and
unauthenticated HTTP smoke tests. All must pass on the final branch HEAD.

Additional protected *manual* acceptance tests remain:
- Two isolated fictional tenants with separate active memberships;
  confirm access is refused across tenant schemas.
- Two CHESS business units with a service grant to only one;
  verify restricted invoice list/report and independent approvals.
- Signed-in author, reviewer and sender as three distinct active users;
  verify same-person send fails and manager revocation blocks actions.
- Client billing consent withdrawal immediately blocks further invoice
  submission, including after the vendor acknowledgment race.
- Fictional AI task changed between suggestion and approval becomes STALE,
  and approved advice applies at most once.
- Fictional invoice create/status contracts at an approved noncharging
  vendor; test UNKNOWN lookup without blind resubmission and VOID refusal.
- Accessibility keyboard/screen reader testing, export CSV injection,
  rate-quota exhaustion, auditing, rollback, DR, vulnerability assessment
  and independent penetration test.

These manual provider/session tests have **not** run or been asserted to pass.

## External items the owner must supply

- AI-only approved HTTPS gateway `CHESS_AI_TRIAGE_API_URL`,
  `CHESS_AI_ALLOWED_HOST`, `CHESS_AI_API_KEY`; signed DPA and explicit
  `CHESS_AI_DATA_SHARING_APPROVED` authorization. Keep
  `CHESS_AI_TRIAGE_ENABLED=false` until verification.
- Invoice-only vendor HTTPS endpoints `CHESS_BILLING_DELIVERY_API_URL`,
  `CHESS_BILLING_STATUS_API_URL`, `CHESS_BILLING_ALLOWED_HOST`,
  `CHESS_BILLING_API_KEY`; per-client approved invoice contact mapping,
  retention/fee/tax policy, DPA and vendor certification. Keep
  `CHESS_BILLING_DELIVERY_ENABLED=false` and
  `CHESS_BILLING_VENDOR_CERTIFIED=false` until verification.
- For the scheduled AI worker: `CHESS_WORKFLOW_WORKER_TOKEN`,
  `CHESS_ACTIVE_TENANT_SLUGS` and explicit approved
  `CHESS_SCHEDULER_ENABLED`. Test using an isolated `chess-m7-sandbox`
  GitHub environment before enabling any tenant.
- The base environment requires approved database/schema migration URLs,
  Clerk keys and sandbox users, current client consent evidence key,
  privacy and logging controls, separate test tenant configurations,
  and productionlike staging with protected secret storage.
- Production release additionally requires legally adequate consent and
  e-sign, S3/ClamAV, licensed affiliate evidence, WORM archive, DR exercise,
  independent security/compliance release approval, and all other M8 gates.

**Milestone 7 feature-code scope is implemented in this branch, but
provider-connected financial execution, payment collection, audited
statutory reporting and production deployment remain unverified and blocked.**

## Scheduled AI worker health addition

The AI-run endpoint now records a separate `AI_TRIAGE` status and
examined/generated/blocked counters for each completed enabled run.
Apply `20261111333000_chess_m7_ai_triage_health` to each isolated
tenant schema before updating applications. A failed DB migration leaves
the worker unable to report success. Only ACTIVE tenant OWNER/ADMIN
sees AI worker run summaries in the UI; no task titles or model payloads
are exposed by this metric. The existing
`CHESS_WORKFLOW_WORKER_TOKEN`, `CHESS_SCHEDULER_ENABLED`,
`CHESS_AI_TRIAGE_ENABLED`, `CHESS_AI_DATA_SHARING_APPROVED`,
`CHESS_ACTIVE_TENANT_SLUGS` and approved HTTPS gateway settings
are still required. A configured flag is not proof of a successful
live provider sandbox request.
