# CHESS CORP 2 — Round 36 legacy tax export privacy hardening

**Development branch:** `feature/operations-overview`, draft PR #24.
**KOBIA boundary:** KOBIA is independent; CHESS is one separate tenant.
**Production boundary:** Never merge, deploy, touch `main`, or enable real
financial/provider services as a result of this source-only improvement.

## Observed Round 35 starting point

Starting SHA `d0b0677b25d862959c4a490340bf3cd904d63200`
passed all three normal CI jobs in
[run 43184184877](https://github.com/awesso007/kobia-platform/actions/runs/43184184877).
Round 36 is a new development increment and needs independently verified
all-green CI against its **own exact final SHA**.

## Confirmed source gap and fixes

The two **legacy KOBIA (not CHESS tenant schema)** 1099 CSV endpoints
previously required only active tenant membership. A VIEWER, STAFF or CLIENT
member could request an entity's vendor tax IDs, addresses and emails.
There was no tax-export-specific access log tied to the record SELECT.

- `src/lib/accounting/legacy-tax-export.ts`: shared SERIALIZABLE
  transaction across current tenant status, current membership,
  active tenant-owned entity, vendor SELECT and legacy AuditLog ALLOW/DENY.
  Only OWNER, ADMIN or ACCOUNTANT may read. Every authorized or denied
  resolved-user attempt is logged with form and decision, not taxpayer PII.
  Failure to write the audit fails closed.
- `src/app/api/reports/1099-nec.csv/route.ts`: read vendor/bill payment data
  only via the transaction-scoped helper. Invalid years are rejected.
- `src/lib/accounting/tax-1099-misc.ts` and
  `src/app/api/reports/1099-misc.csv/route.ts`: the full reportable
  vendor calculation and address read now share that audited transaction;
  the vendor-address query explicitly scopes tenant and entity.
- Both endpoints set `Cache-Control: private, no-store` and
  `X-Content-Type-Options: nosniff`.
- `legacy-tax-export-round36.test.ts`: unit negative coverage for
  stale role snapshot, CLIENT/VIEWER/STAFF, revoked membership,
  inactive tenant, absent entity, audit insert outage, and strict tax-year
  parsing. Passing unit tests do not establish production privacy approval.

## Scope and remaining engineering

This fix covers exactly the **two 1099 CSV read paths**, not every
sensitive KOBIA/CHESS route. The old `general-ledger.csv` and
`trial-balance.csv` exports still need privilege/audit/revocation review,
as do old document, portal and historical reporting endpoints.
The legacy `AuditLog` is a database row, not externally WORM-anchored
evidence; independent archive, PITR restore and access verification are
still required. Concurrent auth revocation is protected by transaction
serialization within the legacy database, **not** across the independent
CHESS tenant and legacy GL databases. A long-running export should also
be penetration/role-tested in protected staging.

No new provider keys, new contracts or feature switches were introduced.
Existing owner-supply groups **02, 03, 04, 15, 17, 18** cover protected
identity/tenants, qualified reviewers, privacy, audit receipts,
two-tenant staged E2E and independent security approval. All 18 groups
remain open pending external proof. **8/8 milestones remain production
blocked; 0/8 independently signed.**
