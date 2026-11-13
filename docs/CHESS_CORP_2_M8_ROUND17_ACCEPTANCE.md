# CHESS CORP 2 — Round 17 Milestone 8 security acceptance

**Code location:** KOBIA `awesso007/kobia-platform`, draft PR #24,
branch `feature/operations-overview`. No production deployment or
live financial/regulatory execution is authorized by these commits.

## Source-level changes to verify

| Workstream | Safe engineering acceptance | Real external acceptance still absent |
|---|---|---|
| Recovery and backup | Restored-clone validator: verify-full PostgreSQL TLS, separate host+database, SELECT-only witness account, S3 version and compliance Object Lock, independent known audit/consent/invoice IDs, 8 critical tenant tables and 6 immutable triggers; policy tests | Actual PITR backup and independent restore, RPO/RTO telemetry, ledger reconciliation, app startup, signed operator witness and DR approval |
| Authenticated E2E | Two host-allowlisted HTTPS origins and independent per-tenant attestation secrets pinning the same exact release SHA. Fixture-based grant, business, cross-tenant, CSRF, revoked consent, reporting, M7 merchant and M3 document lifecycle checks | Real deployed fictional tenants, at least 3 distinct Clerk user sessions, accepted then revoked client consent, signed resulting test report |
| Staging deployment checks | Read-only endpoint attestation must return the expected SHA, avoid caching and block unsigned machine endpoints and private employee APIs | Actual deployed staging instance, injected secrets, migrations, S3/scan/OAuth/partner sandboxes, approved versioned artifact, change-control signoff |
| Operations health | Separate monitor key + explicit on-call policy approval, tenant allowlist, return 503 on unresolved archive, stale scheduler, failed processing, excessive appointment cancellation backlog | Live monitoring vendor and tested pager/incident ownership, alert suppression, rotation, independent runbook and exercise |

## Protected manual workflows — do not mistake existence for a PASS

1. `.github/workflows/chess-dr-restore-acceptance.yml`:
   manually run **only after** operator restored a protected
   fictional tenant clone and supplied all S3/PG evidence.
   Missing witness, disabled trigger, nonverified TLS,
   writable account, unsafe bucket or unmet RPO/RTO blocks.
2. `.github/workflows/chess-authenticated-tenant-e2e.yml`:
   manual staging E2E, verifying distinct active release
   attestations on two deployed fictional tenant origins,
   three unique Clerk sessions and explicit client grant
   boundaries. Missing released SHA/secret/fixture blocks.
3. `.github/workflows/chess-staging-validate.yml`:
   manually checks actual staging configuration, migration
   status, dependency audit, build, deployed SHA and anonymous
   API security boundaries. Does NOT deploy or migrate.
4. Normal `.github/workflows/ci.yml` validates tests,
   lint/build/typecheck and fictional isolated Postgres schema.
   It cannot satisfy 1–3.

## Independent evidence still needed for M8-01 through M8-12

Supply signed backup/rollback rehearsal and trigger list, WORM
archive/vendor receipts, private KMS/S3 least privilege,
actual two-tenant E2E and browser access audit, third-party
pen-test, accessibility/keyboard test, load/incident drill,
dependency vulnerability remediation, real support/on-call
rotas, key escrow/rotation and privacy retention matrices,
licensed/financial contract evidence and separately signed
go/no-go by the authorized release owner.

**No status promotion.** M8 remains PARTIAL and BLOCKED until
each external item is evidenced and an independent reviewer
approves release. Failure to provide credentials produces
a disabled or failing check, not simulated success.

## New credential and approval placeholders

See `docs/CHESS_CORP_2_EXTERNAL_CONFIGURATION.md`,
Round 17 section. New required values include
`CHESS_DR_WITNESS_CONSENT_ID`,
`CHESS_DR_WITNESS_INVOICE_ID`,
`CHESS_AUTHZ_E2E_RELEASE_SHA`,
`CHESS_AUTHZ_E2E_ATTESTATION_TOKEN_A`,
`CHESS_AUTHZ_E2E_ATTESTATION_TOKEN_B`,
`CHESS_INCIDENT_MONITOR_ENABLED`,
`CHESS_INCIDENT_MONITOR_OPS_APPROVED`,
`CHESS_INCIDENT_MONITOR_TOKEN`.

Never transmit live tokens or personal information into
the repository, test fixture logs or assistant messages.
