# CHESS CORP 2 - Round 15 M3-M6 unfinished-item review

**Branch:** `feature/operations-overview`, draft PR #24, not deployed.
**Scope:** M3-01 through M6-06 from
`docs/CHESS_CORP_2_ROUND11_OPEN_ITEMS.md`. This is not an assertion of
complete production release or provider regulatory authorization.

## Verified development additions (subject to latest SHA CI)

| Open item | Engineering result | Still required |
|---|---|---|
| M3-04 | Additive PostgreSQL lifecycle columns, database write-once guards for legal hold, retention and suppression; authorized UI/API; READY document reads fail closed after suppression or retention cutoff | Contracted S3 versioning/object-lock, data classification, hold release, purge policy, external recipient revocation, 2-tenant E2E |
| M3-06 | Read-only, SELECT-only consent legacy aggregate anomaly report; dedicated protected manual workflow and CI policy checks | Independently run on authorized backup/staging DB, signed legacy reissuance/approval, deploy migrations with backup/rollback |
| M4-02 | Employee status/start/renew/revoke UI; disabled-by-default host-pinned gateway; nonce/tenant/employee binding, scope filtering and remote-cancelled-first disconnect rule | Real Google/Microsoft delegated OAuth with gateway-managed PKCE/state callback, token handling, legal privacy, sandbox delivery/reconciliation |
| M5-02 | Up to eight cursor pages, 500 posted USD transactions per page, cross-page duplicate/cursor replay and incomplete response detection; rejected page means no import call | Provider-matched account snapshot, bank data consent, signed webhook/disconnect events, incremental sync, real sandbox tests |
| M6-04 | Four independent provider API key placeholders and service+partner+workflow acknowledgment matching | Official registry licensing, firm affiliation, four signed vendor contracts, create/status/unknown/cancel sandboxes and no unintended regulated execution |

The remaining items (M3-01/02/03/05/07, M4-01/03/04/05/06/08,
M5-01/03/04/05/06 and M6-01/02/03/05/06) are **not complete**.
M4-07 continues to be intentionally deferred until a lawful
cross-tenant scheduling design exists. Do not infer completeness
from a page existing, a local DB trigger or passing unit tests.

## Approval-gated controls

**M3 document lifecycle:** `CHESS_DOCUMENT_LIFECYCLE_ENABLED=true`
and `CHESS_DOCUMENT_RETENTION_POLICY_APPROVED=true` are both
needed. Only an active business owner/admin with an explicit
current service WRITE grant can set a permanent hold, retention
date or download suppression. Each action commits its security
event in the same transaction. No application hard deletion or
hold release path is provided. Local suppression forbids **new**
presigned URLs; already issued URLs may survive their remaining
60-second TTL. Object-lock storage and legal deletion remain
external approvals, not features implied by these fields.

**M3 consent inventory:** run the protected workflow
`.github/workflows/chess-consent-legacy-audit.yml` with an
independently authorized, SELECT-only PostgreSQL account bound
to a single approved tenant and a `verify-full` TLS database
connection. It emits anonymous status counts and structural
anomaly totals only. Never copy real client consent records or
signatures into CI logs. An invalid historical grant must be
independently reviewed and reissued, not backfilled with
invented signatures.

**M4 OAuth:** gateway contract requires exact pinned HTTPS
start/status/revoke URLs, a bearer token stored in a vault,
a five-minute nonce, and responses bound to the signed-in tenant
and Clerk employee ID. The vendor **must** complete one-time
OAuth state, PKCE, callbacks, token rotation/expiry and
user-visible revocation; the KOBIA app never stores provider
tokens. Employee task consent and appointment timing consent are
separate, and remote pending/cancel-unknown events block token
revocation. Real sandbox tests are still unavailable.

**M5 bank feed:** live ingestion remains off by default.
If the approved provider returns `truncated:true`, the gateway
must return opaque URL-safe `nextCursor` and eventually a
`truncated:false` final page within eight pages. Missing,
looping, duplicate, expired, pending or over-limit data rejects
the entire fetch before `createMany`. Database insert remains
deduplicated to legacy `UNMATCHED` rows and never posts a
journal or transfers funds. The provider must attest stable
pagination snapshot and idempotent disconnect handling.

**M6 opaque partner handoff:** activation requires
`CHESS_REGULATED_RESPONSE_BINDING_REQUIRED=true`,
`CHESS_REGULATED_HANDOFF_ENABLED=true`,
four approved `CHESS_REGULATED_PARTNER_<SERVICE>` identifiers,
and separately scoped
`CHESS_REGULATED_PARTNER_<SERVICE>_API_KEY` tokens.
Both create and read-only status responses MUST echo the
exact `workflowId`, `service` and `partnerId`. This is
only coordination-ticket delivery, not mortgage origination,
insurance binding, agency agreement or securities trading.
Provider sandboxes and legal supervision remain independent.

## Owner-provided credentials and externally signed evidence

1. M3: private S3/KMS bucket with versioning/retention/object-lock
   and CORS, credentialed ClamAV/scanner worker, read-only
   historical DB URL, exact tenant allowlist, legal retention
   and e-signature/identity provider contracts, fictional Clerk
   users and signed migration/rollback plan.
2. M4: approved calendar OAuth gateway URLs, host allowlist, scoped
   bearer credential and independent certification of PKCE/state,
   callback and delegated token storage; real Google/Microsoft
   employee sandbox accounts and app tenant worker/monitoring.
3. M5: approved Plaid gateway and consent grant, provider account
   references, cursor snapshot contract, signed webhook verification
   keys, OAuth/disconnect sandbox; independently certified payroll
   and tax e-file providers, explicit posting/reconciliation
   authorization and segregation of duties.
4. M6: four separate service-partner tokens and IDs, official
   NMLS/DOI/DRE/FINRA/SEC data rights, firm affiliations, partner
   DPAs, approved client disclosures and independent licensed
   supervisors and provider execution systems.
5. M8: protected staging HTTPS deployment at the final verified
   SHA, two-tenant/three-identity E2E, tested backup restore and
   WORM receipts, accessibility and independent security/legal
   release approvals.

**No production deployment, existing tenant data migration or live
provider activation is authorized by this development work.**
