# CHESS CORP 2 — Round 43 historical sensitive-read source audit

**Branch:** `feature/operations-overview` | **Draft PR:** [#24](https://github.com/awesso007/kobia-platform/pull/24) | **Production `main`: unchanged**

## Scope and evidence classification

The Round 37 snapshot inventories **162 historical non-/api/chess route files**:
111 marked READ_PATH_REVIEW_REQUIRED, 9 public capability,
26 machine callback, 13 selected source guards, and 3 disabled
unverified-session routes. These **are file-level labels, not counts of
individual authenticated read operations**. A route can implement several
HTTP methods or dispatch hundreds of tRPC procedures.

Round 43 adds a privacy-minimal, default-on **authenticated response-release
audit boundary** to **41 legacy GET route files**. This includes chat/feed,
inventory, workgroups, sites, workflows, form configuration, authenticated
quote PDF, helpdesk and client profile/service reads. The helper
`src/lib/chess/historical-get-response-audit.ts`:

1. Refuses to invoke a legacy read without an active current Clerk
   tenant membership.
2. Lets the original handler perform its **existing** domain permission
   and record-scope checks, collecting a response but not releasing it.
3. Uses `auditedHistoricalTenantRead` in a separate SERIALIZABLE
   transaction to recheck **current** tenant membership and commit
   `HISTORICAL_AUTHENTICATED_GET_RESPONSE` with only a static route ID,
   decision and actor. Failing the audit or fresh role validation returns
   a generic **503** instead of response bytes.
4. Sets `Cache-Control: no-store` before release.

This is **audit-before-response-release**, NOT an audited
transaction-coupled **SELECT**: the legacy data query may already have
happened through another Prisma client/transaction. Original route-specific
scoping, row-level grants, revoked business assignments and live consent
must be reviewed individually. It does not make a route safe merely
because its response is audited.

### Special read surfaces

- The public-facing tRPC endpoint no longer defaults absent tenant
  selectors to `demo`; missing, malformed or conflicting query/header
  selectors fail closed. Selectors are *not* authorization.
- Every successful **protected tRPC query** now rechecks current
  active legacy tenant membership and commits a legacy
  `HISTORICAL_TRPC_PROTECTED_QUERY_READ` AuditLog before returning
  the procedure value. The `tenant.bySlug` public-branding procedure
  remains separately public and must not reveal private records.
  This is a response boundary, **not** a single transaction with
  arbitrary bank/ledger reads or immutable external/WORM proof.
- Global `POST /api/search` is a **read-only POST**: it now uses the
  same response audit gate. Mutating POST handlers are deliberately
  **not** wrapped after the fact: doing so could hide an already
  committed side effect if the audit then failed.

### Enforced future drift check

The ordinary build job now runs
`scripts/chess-round43-historical-get-audit-gate.mjs`.
For all Round 37 `READ_PATH_REVIEW_REQUIRED` entries, it scans
exported GET methods and fails the build unless they retain the audit
wrapper; it separately asserts the tRPC protected query/source selector
guard and the search POST response wrapper. It does **not** certify
multi-method reads, cross-tenant security, public capability validity,
machine callbacks or immutable provider archives.

New `src/lib/chess/historical-get-response-audit-round43.test.ts`
covers current-user denial, suspended-member refusal, audit outage,
response no-store, no PII in event context, denial behavior and
static route-ID validation.

## Honest remaining scope — full coverage not achieved

| Inventory category | Source scope and outstanding assessment |
| --- | --- |
| **41 authenticated legacy GET route files** | Response release now gated on durable audit + active membership; **many underlying SELECTs are still not in the audit transaction** |
| **Protected legacy tRPC queries** | Procedure-level response audit before return; per-entity/record scope and indirect lookups remain to be reviewed |
| **Read-only search POST** | Response audit now required; direct SELECT is still outside audit transaction |
| **13 previously selected source-guarded files** | Earlier legacy GL, 1099, file, mail, share, workflow/form guards; needs method-by-method tests and external evidence |
| **3 disabled legacy portal routes** | Remain inaccessible; verified customer identity replacement is not supplied |
| **9 public/capability files** | Must review token strength, scope, expiration, abuse controls and delivery-specific audit separately |
| **26 machine/callback files** | Must verify HMAC/signatures, replay protection, tenant binding, destination audit and idempotency independently |
| **Remaining authenticated mutation-only / other methods** | Must classify whether POST, PUT, PATCH and DELETE responses disclose sensitive data; add authorization, audit-before-mutation, and atomic transaction boundaries where appropriate |
| **External acceptance** | Actual Clerk/Neon sessions, two-tenant role/revocation races, WORM delivery receipts and independent pen/privacy review remain unverified |

**Therefore the user-requested guarantee of all sensitive reads across all
historical endpoints is NOT established**. The newly added CI source
gate is bounded to authenticated GET responses and the specified
tRPC/search paths; it is not an all-method, all-route security certificate.
Remaining sensitive-read and mutation pathways are still source code work,
not credential-only blockers. Keep M1/M8 partial; leave 8/8 production
milestones blocked, 0/8 independently signed, feature flags OFF,
PR #24 draft and `main` unchanged.

## External evidence and no-new-secret statement

Owner-supply groups **01/02/03/04/05/15/17/18** remain OPEN for genuine
Clerk TEST identities, cross-tenant revocation and consent/role change
replays, private-file/share token abuse tests, independent WORM archive
receipts, monitoring of audit-outage denials, and security review. This
round needs no newly issued vendor API credential merely to run
its source-only tests. Do not paste keys/tokens into this repository.

**Verification:** The final Round 43 source commit must pass all
three normal GitHub Actions jobs on its exact SHA. A normal CI success
cannot claim live protected-browser or licensed acceptance.
