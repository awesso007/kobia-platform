# Round 27 — employee-facing CHESS CORP 2 UI inventory

**Branch:** feature/operations-overview. **PR:** #24 (draft, unmerged). **Production:** unchanged.

## M1–M8 presentation coverage

| Milestone | Employee or admin screen | Authorization and release boundary |
| --- | --- | --- |
| M1 profiles, audited access | /app/client-profiles and /app/client-profiles/[profileId] | Current membership and explicit individual service-grant checks. Security audit records are visible only to authorized tenant administrators. |
| M2 business/staff | /app/business-units | Round 27 shows confirmation and actual number of grants revoked during employee offboarding. Independent other-business grants remain unchanged. |
| M3 consent, documents | Client-profile consent requests, test-only client portal, embedded ServiceDocumentPanel in finance/regulated case screens | New document UI explains current verified purpose-specific consent, service grants, malware scan, version pinning and 60-second signed URL limitation. |
| M4 calendars, tasks | /app/work-items and /app/calendar | Employee consent, recurrence, appointments, alerts and manager queue. Worker callbacks and run routes have no employee execution button. |
| M5 finance, payroll, tax | /app/finance-operations and authorized per-case page | Bank review, posting preview, read-only ledger verification, tax workpaper approval, payroll source approvals/status. No invented settlement, ACH, tax-filing or provider confirmations. |
| M6 regulated coordination | /app/regulated-services and per-case page | License/affiliation verification, current consent, checklist and opaque handoffs. Actual origination, binding, closing, trades are external licensed systems, not generic employee buttons. |
| M7 AI, billing, reporting | /app/ai-operations, /app/service-billing, /app/operations-intelligence, /app/operations-reports | Recurring draft plan now displays last inspected UTC or never inspected. Inspection does not imply successful draft creation, delivery or cash collection. |
| M8 security/health | /app/security-operations and worker health on /app/work-items | Tenant-scoped read-only audit and worker exceptions. WORM, DR, staging attestation and incident callbacks require independent operators. |

## New screen and UI improvements

- **/app/chess-desk:** new navigable staff service directory. Ordinary staff see only employee workspaces; owner/admin-only links are hidden. Each destination independently enforces backend authorization. Linked from /app/overview for both employee and supervisor roles.
- **Business units:** employee revocation requires a confirmation explaining permanent client-service-grant removal, and displays the server-returned count of grants revoked in the selected business. Reassignment does not restore grants.
- **Service billing:** displays plan lastInspectedAt and distinguishes a blocked scheduler attempt from invoice draft approval, vendor delivery and settlement.
- **Document panel:** explains active client consent and scanned version requirements, including the limits of existing signed URLs; quarantined records have no download button.
- **Bank reconciliation:** an approved bank review retains the read-only historical journal verification action even when there are no unmatched transactions.

Static server-side React rendering tests cover role visibility, worker inspection, offboarding warnings, document safety and bank reconciliation. Exact latest SHA CI must be inspected before claiming all tests pass.

## Backend features that intentionally must not have employee execution buttons

- Scheduled recurrence, recurring invoice draft worker, payroll status polling, calendar sync, audit archive export, malware scan callbacks, merchant payment webhook, incident monitoring and staging attestation.
- Actual payroll funding/tax deposit, real tax e-file, bank money transfer and settlement, mortgage origination, insurance binding, real estate closing, and investment trading.

The existing backends require certified external providers, human approvals and operator-held secrets. No UI may fabricate results or convert a signed provider observation to settled cash.

## Remaining acceptance and credentials

A real signed-in Clerk test with at least two tenants, business roles and consent revocation, keyboard/screen-reader and responsive usability tests, isolated Codespaces preview, S3/KMS/scanner, provider sandboxes, WORM archive, PITR and independent legal/licensing/release approval remain unresolved. Do not merge PR #24 or deploy production.

**No new external credentials were introduced.** The sole canonical supply register is CHESS_CORP_2_OWNER_SUPPLY_CHECKLIST.md, and the Round 26 engineering audit continues to identify other incomplete code-only or combined tasks. This UI round does not establish complete M1–M8 or overall source-code readiness.
