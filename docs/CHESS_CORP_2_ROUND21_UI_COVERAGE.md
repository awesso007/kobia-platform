# CHESS CORP 4 - Round 21 employee UI coverage review

**Branch:** feature/operations-overview
**PR:** #24, draft, unmerged
**Scope:** CHESS-specific backend routes and the employee-facing CRM shell.
All development here remains disconnected from production until independent M1-M8 release gates pass.

## Existing screens found in the repository

| Backend workflows | Existing employee screen |
| --- | --- |
| Tenant and business/staff assignment | /app/business-units |
| Client profiles, explicit service grants and revocation | /app/client-profiles and /app/client-profiles/[profileId] |
| Service consent and lifecycle | Employee consent screen, plus independently gated signed-in client consent portal |
| Client service document upload/quarantine/READY download/lifecycle | ServiceDocumentPanel inside finance and regulated case pages |
| Task transitions, manager queues, recurrence, alerts | /app/work-items |
| Appointments, calendar preferences, delegated OAuth | /app/work-items |
| Bank connection and unmatched import | /app/finance-operations |
| Bank suggestion, independent review, read-only GL preview | /app/finance-operations/[caseId] |
| Tax workpaper review and finance entity mapping | /app/finance-operations/[caseId] |
| Licensed practitioner registry, firm affiliations, workflow checklists and handoff | /app/regulated-services |
| AI task triage with independent review and provider call budget | /app/ai-operations |
| Invoice approval, provider delivery, merchant observations and recurring draft billing | /app/service-billing |
| Monthly business and portfolio reports, frozen period snapshots | /app/operations-reports |
| Generic action approval and independent manager review | /app/action-approvals |

## Round 21 added UI

1. **Bank journal posting operator panel**, within /app/finance-operations/[caseId].
   It uses the existing independently authorized read-only preview, displays
   debit and credit totals, requires a check box and exact typed confirmation,
   and calls POST /api/chess/bank-posting ONLY if the four independent
   release flags are set and the actor is OWNER/ADMIN. A real execution
   response records only a journal reference, not asserted bank settlement.
   The transaction fingerprint comes from the backend preview and is checked
   again at posting time. Demo stays locked.

2. **Payroll vendor dispatch desk**, within the existing PAYROLL service case
   page. Shows provider assertions, pay-run reference and last checked time.
   Existing independently approved PAYROLL_EXECUTE requests can be submitted
   by a separate human, with explicit confirmation, only if certified
   provider configuration and current manager privileges pass. No wage
   calculations, ACH, e-file or automatic retransmission are added by UI.
   Generic action approvals now display selectable opaque references.
   The backend separately enforces three distinct requester/reviewer/operator
   identities instead of permitting the reviewer to execute.

3. **Tenant-wide security assurance**, /app/security-operations. Owner/admin
   only. An audited SERIALIZABLE tenant read checks fresh membership
   before returning current incident indicators, immutable archive queue
   state, privacy-limited security decision types and recent scheduler runs.
   This is NOT a replacement for the machine-only monitored health endpoint
   and does not claim a zero-alert internal snapshot is a passed external audit.

4. **Navigation and access**: the manager overview links to the relevant
   CHESS financial, billing, work and security desks. Ordinary staff see a
   CHESS work-items entry but never a tenant-wide audit shortcut.

## Deliberately machine-only: NO employee execution button

- POST /api/chess/audit-archive/run is a token-protected worker.
- POST /api/chess/scan-worker and document-scan callback require isolated
  scanner identity and cannot be exposed as human uploads or fake CLEAN.
- GET /api/chess/incident-health is a distinct monitor-secret endpoint;
  its token must never reach a browser or employee page.
- /api/chess/staging-attestation is restricted to release verification.
- /api/chess/ai-triage/run, /api/chess/calendar-sync/run,
  /api/chess/recurrences/run, /api/chess/recurring-billing/run,
  and /api/chess/payroll-status/run are controlled machine jobs.
- /api/chess/merchant-events is a signed provider callback, not a manual
  payment confirmation or "mark paid" action.
- /api/chess/document-scan is a signed scanner callback, not a human
  verification of malware safety.

## Next release and acceptance work (unverified by a screenshot or green CI)

- Independent browser accessibility and real signed-in employee-role matrix
  must test owner/admin/member/manager and cross-business restrictions.
- Bank posting requires four separate finance release approvals, accurate
  chart-of-accounts mappings, independent PostgreSQL concurrency, source
  consent-revocation reconciliation and real bank-provider sandbox evidence.
- Payroll execution requires current approved processor terms and identity,
  reviewed PAYROLL_EXECUTE fingerprint, signed payout/account/tax controls,
  and independent cash/tax remittance reconciliation. The generic approval
  interface does not produce a payroll-run-specific approval fingerprint;
  that preparation remains a controlled source workflow/external approval
  requirement. Providing an arbitrary approval ID cannot bypass backend
  fingerprint verification.
- Actual incident escalation needs a deployed independent paging service,
  on-call, archive WORM receipts, monitored secrets and signed drills.
- A green CI build does not assert production readiness. All M1-M8 legal,
  licensing, external S3, E2E, PITR, staging and signed release gates remain.

## Manual test checklist for staging

1. Sign in with a valid OWNER account in one authorized CHESS tenant.
2. Confirm the finance case can preview an APPROVED bank review but cannot
   offer a posting confirmation while any financial release flag is unset.
3. Confirm the same pages never offer bank or payroll execution in demo mode.
4. Confirm a PAYROLL case has status history and does not expose employee
   wage records or bank details.
5. Confirm the unprivileged MEMBER sees only allowed work and receives
   access denied at /app/security-operations.
6. With OWNER, verify /app/security-operations displays only the current
   tenant's summary, recent decision types and machine worker counts.
7. Verify expired consent, revoked grant, reassigned staff, stale bank
   fingerprint, previously submitted pay run, missing provider or invalid
   approval all fail closed at the APIs.
8. Observe the real staging reverse proxy, Clerk origin and accessibility
   with approved test-only keys before any production release.

## Required external configuration (placeholders, never actual secrets)

- Bank execution: CHESS_BANK_POSTING_ENABLED, CHESS_BANK_POSTING_POLICY_APPROVED,
  CHESS_BANK_POSTING_BANK_SANDBOX_APPROVED, CHESS_BANK_POSTING_OPERATOR_APPROVED
  (all omitted/false until a named independent approver signs each).
- Payroll vendor: CHESS_PAYROLL_PROVIDER_CERTIFIED,
  CHESS_PAYROLL_EXECUTION_ENABLED, CHESS_PAYROLL_API_URL,
  CHESS_PAYROLL_ALLOWED_HOST, CHESS_PAYROLL_API_KEY,
  independently reviewed PAYROLL_EXECUTE authorization/legacy entity mapping,
  and the real payroll provider acceptance certificate.
- Monitoring: CHESS_INCIDENT_MONITOR_ENABLED,
  CHESS_INCIDENT_MONITOR_OPS_APPROVED, CHESS_INCIDENT_MONITOR_TOKEN,
  CHESS_SCHEDULER_ENABLED, CHESS_ACTIVE_TENANT_SLUGS,
  distinct CHESS_WORKFLOW_WORKER_TOKEN, external paging contract and WORM
  audit archive receipt/retention infrastructure.
- Clerk verified test sign-in/roles, staging HTTPS origins,
  provider sandboxes, legal counsel and licensed firm approvals remain
  independently required. No credentials are stored in this repository.

**Status:** screens implemented and source CI verification required. No merge,
no production deployment and no milestone is marked release-complete.
