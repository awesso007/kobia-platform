# CHESS CORP 2 — Round 50 transaction-coupled sensitive-read implementation

**Working branch:** `feature/operations-overview`.
**Draft PR:** [#24](https://github.com/awesso007/kobia-platform/pull/24).
**Production:** main and Vercel unchanged, no migration/merge/deploy.

## Verified code inventory

The historical Round 37 inventory identifies 162 route files,
111 authenticated-read category paths, and **42 authenticated GET
methods**. Their Round 50 admission controls:

| Read class | Routes | Source execution |
| --- | ---: | --- |
| Tenant-schema historical GET | 39 | `withAuditedHistoricalGet` opens `Serializable` Prisma callback; bind tenant transaction through request-local AsyncLocalStorage; SELECT and tenant-local security event commit together |
| CHESS client-profile source-audited GET | 2 | Explicit `withAlreadyAuditedHistoricalGet` exception; underlying `auditedChessSensitiveRead` and `auditedClientServiceRead` already couple direct SELECT, live role/grant checks and audit within their own transactions |
| Legacy accounting tRPC GET | 1 | `auditProtectedQuery` middleware opens serializable legacy Prisma callback; rechecks active user/tenant/member; all protected tRPC router model selectors and nested bank-reconciliation selectors use read-only scoped client; auditLog INSERT before release |
| Authenticated read-only search POST | 1 additional | Same tenant-schema callback with scoped `$queryRaw` and event |

**Not counted:** unauthenticated public branding, token-based
share/signature reads and machine webhooks have different
authorization contracts. The 104 historical files with 129
authenticated non-GET methods from Round 49 are mutation scope,
not recategorized here.

## Security invariants and fail-closed behavior

1. A missing Clerk identity cannot run a legacy read handler.
2. During GET execution, `getTenantDb` and direct
   `getTenantPrisma` resolve the same transaction client and
   refuse foreign schema/tenant selection.
3. Active membership is loaded inside the SELECT transaction, not
   trusted from an earlier browser cookie. Route-specific RBAC,
   private-channel and scoped-child restrictions run using the
   bound transaction; a status-denied result is logged as DENY.
4. A successful response cannot leave until the event INSERT
   and the serializable transaction COMMIT have succeeded.
   SELECT failure, audit failure or commit failure yields 503
   with no sensitive body; no empty audit is treated as success.
5. The separate legacy-ledger tRPC middleware rechecks live user,
   tenant and membership, provides a transaction-scoped proxy
   to protected query handlers and nested reconciliation reads,
   blocks nested transaction/write operations from that proxy,
   and commits its AuditLog before return.
6. Only two explicitly named client-profile routes can rely on
   their previously transaction-coupled grant checks. The
   exception wrapper cannot register other route names.
7. CI drift gate enforces all 42 inventory GETs, source-wrapper
   shape and tRPC router/query-helper proxy usage. Unit tests
   cover denial/rollback, and tenant-schema disposable PostgreSQL
   integration checks actual transaction and event persistence.

## Residual engineering and acceptance

Transaction coupling is not a substitute for **per-business**
authorization. Existing KOBIA legacy CRM permissions often
remain coarse tenant-wide actions. The code also requires
separate audit for direct Prisma clients in transitive helpers,
provider/public machine query pathways and sensitive output
from mutation responses. Protected multi-tenant Clerk E2E,
business grant race, audit WORM custody and production-like
database connection/serialization tests are outstanding.
No feature switch has been turned on.

The integration suite uses disposable, fictional Postgres data:
it does not establish a vendor contract, legal consent or
production support. Record and query-specific FKs and exact
entitlements must still be reviewed for regulated services.
The canonical owner checklist contains the needed inputs; no
new live credential was collected in Round 50.

**M1/M8 PARTIAL; 8/8 production milestones blocked, 0/8
independently signed off.** An exact-final-commit 3/3 CI success
is necessary before describing Round 50 as CI-verified.
