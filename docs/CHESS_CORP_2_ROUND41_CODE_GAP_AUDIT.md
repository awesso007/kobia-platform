# CHESS CORP 2 — Round 41 code-only gap audit and recovery controls

**Branch:** `feature/operations-overview` · **PR:** [draft #24](https://github.com/awesso007/kobia-platform/pull/24) · **Production:** `main` untouched.

## Scope and objective

Round 41 started from verified Round 40 commit
`8749b59f43fef931cda34ed340fb2b33ba9706e1`,
normal CI [run 43286579398](https://github.com/awesso007/kobia-platform/actions/runs/43286579398)
(three green jobs). This round audits the M1–M8 matrix and implements
additional code-only failure safeguards for independent financial and
document outcomes. This report **does not** claim all historical security
routes, staged providers or legal delivery are complete.

## M3 — ambiguous private document deletion

- The document delete worker is **default OFF** and refuses the fictional
  demo mode, non-tenant-prefixed storage keys, inactive approving personnel,
  inactive businesses, unexpired retention and any legal hold observed
  immediately before storage deletion.
- Before a physical delete, the worker calls S3 `ListObjectVersions`
  and refuses a missing, truncated or multi-version content inventory. Only
  exactly **one** byte-bearing content version with the persisted
  `storageVersionId` can be deleted.
- Following deletion the worker requires both an explicit 404 for that
  exact version and an exhaustive listing with **zero** remaining content
  versions for that key. Network failures, permissions errors, ambiguous
  results and unexpected versions enter **UNKNOWN** and are not retried.
- Added authenticated `PATCH /api/chess/document-lifecycle` for a distinct
  third owner/admin to inspect an UNKNOWN disposal. It never issues another
  DELETE; it only tombstones the document and pins a privacy-minimal
  sha256 receipt after an exact-version 404 and zero remaining versions,
  fresh active role/business checks, lawful retention expiry, and no
  legal hold. Original requester, approver and resolver must all differ.
- The S3 receipt establishes only the object-store version inventory
  and observed absence **at that time**. It does **not** certify
  backup removal, vendor WORM compliance, complete personal-data erasure,
  restoration, or legal sufficiency.

**External inputs:** previously listed 04/05/15/16/17/18. The approved
private bucket runtime IAM now explicitly needs read-limited
`s3:ListBucketVersions` on the exact private bucket, in addition to
`s3:DeleteObjectVersion`, `s3:HeadObject`, approved KMS/Object Lock and
strong audit logs. Object storage's write-once/legal-hold enforcement must
be independently tested; a database hold cannot prevent a concurrent
external S3 request without provider controls. All purge activation flags
stay FALSE; `CHESS_DOCUMENT_PURGE_WORKER_TOKEN` must be supplied via vault.

## M5 — ambiguous legacy bank journal receipt

- Added `POST /api/chess/bank-reconciliation` for an explicitly authorized
  owner/admin, separate from the read-only GET. New independent
  **default-OFF** gates: `CHESS_BANK_OUTCOME_RESOLUTION_ENABLED` and
  `CHESS_BANK_OUTCOME_POLICY_APPROVED`.
- The resolver needs **four different** actors: the review creator, review
  approver, journal executor and separate outcome reconciler.
- An `UNKNOWN` attempt may be inspected; `EXECUTING` must have been
  in flight for at least 30 minutes. Current client consent, exact
  business/grant/case/mapping/review and receipt scope are rechecked in a
  SERIALIZABLE tenant transaction with an immutable tenant audit.
- A verified `MATCHED_POSTED` journal is the **only** success path, which
  pins the existing journal ID to the durable attempt. `UNPOSTED`,
  `DIVERGED` and ledger `UNKNOWN` remain unresolved. This function
  never posts/retries a journal, marks FAILED or claims external settlement.
- The earlier execution endpoint no longer silently returns a successful
  GL replay when a durable attempt is absent, nor does the original
  executor self-resolve an `UNKNOWN/EXECUTING` attempt.

**External inputs:** existing 07/14/16/17/18. Four distinct, real,
protected-staging financial identities, accountant/legal approval, two
independently operated databases and witnessed provider/network failure
rehearsals are required before either flag is enabled. None are
supplied or claimed by normal CI.

## M1–M8 matrix: additional gaps not honestly certifiable as finished

| Milestone | Remaining engineering and external acceptance |
| --- | --- |
| M1 | 146 historically inventoried KOBIA API route files outside the selected Round 37 guard sweep still require path-by-path authorization/audit review; prove two-tenant revocation and legal sharing policy |
| M2 | Real legal/business entity and employee license assignments; staged cross-business and revocation race evidence |
| M3 | Independent legal retention/hold/erasure policy; external version inventory/object-lock/restore proof, legal hold release adjudication and client-identity tests |
| M4 | Real scheduler, pager, delegation/provider cancellation and signed-in accessible mobile tests; optional global calendar conflict coordination |
| M5 | Ambiguous UNPOSTED / DIVERGED outcomes need separately witnessed human case handling; actual bank receipts, payroll/tax partners and accountant close |
| M6 | Licensed firm sponsors, certified partner credentials and actual mortgage/insurance/property/investment acceptance |
| M7 | Provider settlement, disputes and independent statutory statement/close accountant approval |
| M8 | Authenticated protected two-tenant browser, pen/load/security reviews, vault, WORM/PITR and witnessed recoveries |

These are not automatically reclassified as external-only: residual
historical-route review, code quality, exception handling and
independent UNKNOWN case operations include **unverified code-only work**.
Consequently the exact build-completion phrase must **not** be used.

## Tests and release boundaries

Added fail-closed unit tests for third-party document resolver separation,
four-party financial resolver, stale-execution rules, no source-posting
retry, denial of unproven ledger replay, and S3 version pagination/hidden
content. Normal CI runs source checks and disposable tenant + legacy GL
PostgreSQL tests. The exact last-source-commit GitHub Actions verification
must be recorded separately once it finishes. A green normal CI cannot
substitute for external bucket/provider/Clerk staging proof.

**No merge, production release, external deletion, bank settlement,
real customer consent or provider credentials are authorized here.**
