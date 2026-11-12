# CHESS CORP 2 — Round 45 document lifecycle implementation and remaining release gates

**Repository:** `awesso007/kobia-platform` | **Draft PR:** [#24](https://github.com/awesso007/kobia-platform/pull/24)
**Development branch:** `feature/operations-overview` | **Production `main`: unchanged**
**Boundary:** CHESS is one isolated tenant of independent KOBIA; no production credentials, real files or legal signoffs are implied.

## Starting point

The final Round 44 SHA
`4e29c22e07fc4d951b39546640a680f29add9455`
passed 3/3 normal CI jobs in
[run 43300160700](https://github.com/awesso007/kobia-platform/actions/runs/43300160700).
Rounds 39 and 41 already supplied metadata-only, disabled-by-default
retention, redaction, immutable revision records, two-actor disposal,
pinned S3 version deletion and third-person UNKNOWN reconciliation source.
Round 45 closes further source gaps without activating physical deletion.

## Code-level changes and independent test evidence

| Component | Round 45 implementation | Verification and limitations |
| --- | --- | --- |
| **Retention** | Versioned tenant migration `20261112200000_chess_document_lineage_retention_inheritance` enforces monotonic inheritance of a predecessor's retention date through direct and deeper replacement/redacted revisions; a child cannot silently shorten the original legal period; later parent protections propagate within PostgreSQL | New disposable PostgreSQL integration test verifies copied retention and later cascade; no jurisdiction-specific policy is assumed |
| **Legal holds and suppression** | Inherited holds, decision actors, and permanently suppressed download flags propagate across descendants. A child may not bypass an already-held/suppressed original by replacing its version | PostgreSQL integration checks immutable hold/suppression; no automatic hold release or unsuppression is allowed |
| **Version acceptance** | Upload confirmation now distinguishes an explicit S3 HEAD 404 from timeout/access failure; it confirms **one exact pinned version with an untruncated content-version inventory** before a single SERIALIZABLE live-grant-checked and audited QUARANTINED/REJECTED transition | New unit test covers acceptance, ambiguous duplicate versions, a missing/timeout HEAD, revoked actor and foreign tenant key. Storage versioning, `HeadObject` and `ListBucketVersions` IAM required in protected environments |
| **Scanning** | Malware callback is HMAC/timestamp/tenant bound as before; Round 45 makes a verified scan single-use, audits metadata rejection in the same transaction, and refuses CLEAN if an extra unscanned S3 object version exists | Real scanner, signature origin, malware efficacy, S3 ownership and real file corpus remain external acceptance |
| **Redaction** | A CLEAN scanned REDACTED derivative stays QUARANTINED. A **different owner/admin** can fetch the pinned file through a protected same-origin read mode. The server checks SHA-256 of all bytes, verifies single content version, commits a privacy-minimal review-read security event, and returns the verified bytes. Publishing requires a **post-scan** review event, explicit independent content-review attestation, current service grant and immutable parent supersession in the same transaction | New unit tests check uploader self-review, corrupted content, multi-version ambiguity, grant recheck and absent review evidence. A reviewer’s attestation does not independently prove careful human review of every page/layer; use supervised QA and content inspection |
| **Deletion and UNKNOWN** | Existing default-OFF worker requires legal retention expiry, two distinct active owner/admin signers, stable tenant key, exact one-version inventory, version-specific S3 delete, explicit 404, zero remaining versions and an atomic event/tombstone. The separate UNKNOWN reconcile endpoint issues **read-only HEAD/list, never a second delete** and requires a third independent owner/admin. Round 45 adds an authorized employee UI for this independent UNKNOWN check | Unit tests exercise self-approval denial, legal hold, missing/unexpired retention, read-only UNKNOWN and immutable receipts. **Not enabled or exercised against a real bucket** |
| **Audit and navigation** | Upload pin or reject decisions, review reads, scan rejection/publish, retention/hold/suppression, redaction approval, disposal request/approval/reject, worker claim/outcome and UNKNOWN reconciliation all have tenant security-event paths. The UI resolves private relative download paths as same-origin and no longer asserts an incorrect 60-second URL expiry | Tenant events remain append-only, not external immutable/WORM archive delivery; genuine concurrent role/consent and storage faults require protected tests |

## Remain deliberately OFF and unverified

- `CHESS_DOCUMENT_LIFECYCLE_ENABLED=false`,
  `CHESS_DOCUMENT_RETENTION_POLICY_APPROVED=false`,
  `CHESS_DOCUMENT_PURGE_EXECUTION_ENABLED=false`,
  `CHESS_DOCUMENT_PURGE_STORAGE_APPROVED=false`,
  `CHESS_SCAN_CALLBACK_ENABLED=false` remain deployment defaults.
- A **separately approved** private, versioned S3 bucket, isolated
  `KOBIA_S3_*` credentials, exact version HEAD/LIST/DELETE IAM,
  Object Lock/WORM, backup and replica erasure accounting, versioned
  object recovery and independent external audit receipts are still
  needed. The tenant database is **not a physical byte-deletion receipt**.
- Counsel-approved service/jurisdiction retention schedules, legal hold
  management and release, records subject-access/erasure procedures,
  verified client consent/e-sign language and documented retention
  exceptions have **not** been signed off.
- Distinct verified Clerk staging accounts, an independently supervised
  scanner, manual review of PDF redaction layers/metadata, real private
  S3 fault/retry drills and independent privacy/security signoff remain
  owner/vendor-controlled. A successful isolated test cannot certify
  production destruction, download revocation after a file was already
  exported, or WORM availability.
- Presigned PUT grants remain valid until their expiry; a second PUT
  could add another content version while review is in progress. New
  version inventory checks refuse to approve such ambiguous cases,
  but a witnessed storage-level no-overwrite/Object Lock policy is
  required before production. A generic version-specific 404 **does
  not prove** copies, replicas, caches or backups have been erased.
- Legacy pre-CHESS KOBIA document routes and other historical sensitive
  API operations remain separate M1/M8 code audit gaps. This does
  **not** certify the entire platform’s file/document handling.

**No newly issued external secret is needed for the Round 45 source work.**
`s3:ListBucketVersions` is already registered with owner-supply groups
**04/05/15/16/17/18**, now also required at upload confirmation, scanner
and independent redaction review, not merely at deletion. A protected
test Clerk instance and distinct owner/admin operator accounts remain
under groups **01/02/17/18**. Existing 18 owner-supply groups remain open.

**Release accounting:** M3 and M8 retain **PARTIAL CODE / BLOCKED**
until independent acceptance. All **8/8** production release gates
remain blocked, **0/8** independently signed. This is a bounded
engineering milestone, not evidence that every roadmap code-only
item is complete.

**Final verification:** Record the exact final Round 45 SHA and 3/3
normal GitHub Actions result in the implementation report, not the
results of an earlier/intermediate commit. The protected authenticated
browser, S3 Object Lock, immutable archive, recovery, compliance and
licensed service acceptance workflows remain separate.
