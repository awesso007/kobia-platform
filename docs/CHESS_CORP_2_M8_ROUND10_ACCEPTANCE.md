# CHESS CORP 2 - Round 10 Milestone 8 acceptance and external inputs

**Status: CODE VALIDATION ONLY. Staging and production are NOT deployed
or independently approved.** These are controls for the KOBIA multi-tenant
platform and CHESS tenant, not permission to activate regulated providers.

## What Round 10 added

1. **Build identity:** a bearer-protected
   `GET /api/chess/staging-attestation` reports only a separately injected
   release SHA. The protected manual staging workflow requires an exact
   HTTPS allowlisted deployed origin, SHA equal to the workflow's commit,
   noncacheable response headers, rejection of an anonymous request,
   and a production-dependency audit. This is a *self-reported app build
   marker*, not signed artifact provenance, rollout verification or a
   staging deployment.
2. **Private transport headers:** authenticated CRM and CHESS API paths
   receive no-store, no-referrer, nosniff, deny-framing, cross-origin
   resource isolation and restricted browser permissions. JSON mutations
   reject disguised media types, cross-site Fetch Metadata and, in
   production, the absence of a canonical `CHESS_PUBLIC_ORIGIN`.
3. **Isolated authenticated E2E:** a manually invoked, protected three-user,
   two-tenant script checks independent tenant access, cross-business
   denial, revoked service-consent denial, invoice/portfolio restrictions
   and several forged-Origin mutation attempts. It requires *real*
   fictional test sessions; CI only runs credential-free negative
   harness tests. Signed-in E2E is NOT marked successful without fixtures.
4. **Backup and recovery:** a protected, read-only external DR validator
   demands a distinct isolated database hostname and name, verified TLS,
   a database account without mutating or administrative privileges,
   required restored audit-event triggers, an immutable pre-backup witness,
   and a pinned encrypted COMPLIANCE-locked object version. Operator-supplied
   timing evidence is bounded against declared RPO/RTO targets, but is
   NOT independent proof of actual recovery or ledger reconciliation.
5. **Tests:** native Node policy checks, Vitest authentication/response
   header checks, anonymous HTTP security probes, versioned PostgreSQL
   integration tests and normal CI. Refer to the final commit's Actions
   run for the actual result; the manual workflows are not executed by CI.

## External items to supply

### Protected staging deployment and GitHub Environment `chess-staging`

Deploy the reviewed SHA into a separately approved private staging
environment, using fictional data and the existing Clerk/database/S3/
scanner prerequisites from `CHESS_CORP_2_EXTERNAL_CONFIGURATION.md`.
Inject into the **deployed application**:
- `CHESS_STAGING_ATTESTATION_ENABLED=true` only in approved staging;
- `CHESS_RELEASE_SHA` = full deployed 40-character Git commit SHA;
- `CHESS_STAGING_ATTESTATION_TOKEN` = separate random vault secret of
  at least 32 characters (never reuse Clerk or a worker token);
- approved `CHESS_PUBLIC_ORIGIN` = exact public HTTPS origin.

In the **protected GitHub Environment** provide:
- `CHESS_STAGING_VALIDATE=true` after staging is actually deployed;
- `CHESS_STAGING_BASE_URL` = exact deployed HTTPS root origin ending in `/`;
- `CHESS_STAGING_ALLOWED_HOST` = exact dedicated staging hostname;
- `CHESS_STAGING_ATTESTATION_TOKEN` = the protected bearer secret;
- `CHESS_STAGING_EXPECTED_SHA` is supplied by GitHub `github.sha`
  (do not override it with a manually guessed version).

Manual workflow `chess-staging-validate.yml` must run on that exact
commit and pass config, read-only PostgreSQL/S3/ClamAV connectivity,
tenant migration status, lint, tests, production build, dependency
audit, deployed identity, anonymous auth denial and HTTP smoke.
The workflow validates and DOES NOT deploy or apply migrations.

### Protected authenticated E2E environment `chess-authz-e2e`

Supply `CHESS_AUTHZ_E2E_VALIDATE=true`,
`CHESS_AUTHZ_E2E_ISOLATED=true`,
`CHESS_AUTHZ_E2E_ALLOWED_HOSTS` (exact two distinct trusted HTTPS
hosts), `CHESS_AUTHZ_E2E_BASE_URL` (tenant A),
`CHESS_AUTHZ_E2E_OTHER_TENANT_URL` (tenant B), and
`CHESS_AUTHZ_E2E_MONTH` (valid `YYYY-MM`).

Supply **three distinct short-lived Clerk test cookies** as protected
secrets: `CHESS_AUTHZ_E2E_MANAGER_COOKIE` (tenant A owner/admin),
`CHESS_AUTHZ_E2E_NO_GRANT_COOKIE` (tenant A staff without grants),
and `CHESS_AUTHZ_E2E_OTHER_TENANT_MANAGER_COOKIE` (independent
tenant B owner/admin). These must not come from real customer accounts.

Provision and supply the corresponding opaque fixture IDs:
`CHESS_AUTHZ_E2E_BUSINESS_ID` (A permitted business),
`CHESS_AUTHZ_E2E_OTHER_BUSINESS_ID` (A business forbidden to A manager),
`CHESS_AUTHZ_E2E_SERVICE_CASE_ID` (live granted case in A),
`CHESS_AUTHZ_E2E_OTHER_CASE_ID` (forbidden case in A),
`CHESS_AUTHZ_E2E_REVOKED_CASE_ID` (A case with deliberately withdrawn
service consent), and
`CHESS_AUTHZ_E2E_OTHER_TENANT_BUSINESS_ID` (B permitted business).
All fixture data must be synthetic, independently initialized, and
removed after the test; retain a private signed test report.

### Independent DR restore environment `chess-dr-restore`

A separate operator must create an encrypted, versioned S3 Object Lock
COMPLIANCE backup and restore an isolated read-only PostgreSQL clone,
with the exact schema and migration state. Supply the existing
`CHESS_DR_*` bucket, key, version, region, endpoint, allowlist,
S3 credentials, test tenant and immutable witness inputs listed in
`CHESS_CORP_2_EXTERNAL_CONFIGURATION.md`.

Additional mandatory controls:
- `DIRECT_URL` = protected **source reference metadata** only;
- `CHESS_DR_RESTORE_DATABASE_URL` = separate host *and* DB name,
  read-only PostgreSQL user, TLS with valid server certificate;
- `CHESS_DR_RESTORE_ALLOWED_HOST` = exact isolated host, distinct
  from production/source host, and `CHESS_DR_REQUIRE_PG_SSL=true`;
- `CHESS_DR_DRILL_STARTED_AT`, `CHESS_DR_RESTORE_READY_AT`,
  `CHESS_DR_SOURCE_LATEST_AT`,
  `CHESS_DR_RESTORED_LATEST_AT` = independently witnessed UTC
  timestamps, not invented or taken from an untrusted test;
- `CHESS_DR_RTO_TARGET_MINUTES` and `CHESS_DR_RPO_TARGET_MINUTES`
  = approved numeric targets between 1 and 1440 minutes;
- `CHESS_DR_EVIDENCE_TICKET` = opaque private tracking ID of the
  operator-signed restore evidence.

The script validates only supplied timing arithmetic and read-only
backup/DB evidence. An authorized operator must independently witness
the backup, perform the restore, verify data/ledger reconciliation and
application startup, measure recovery time, document PITR capability,
and attest target achievement. A code-only CI success is not a DR drill.

## Additional blockers unchanged

- Independent archive provider and signed retention/WORM/DPA evidence;
  customer consent provenance, e-sign and retention/deletion decisions.
- Real provider sandboxes for AI, invoice delivery, bank data, payroll,
  licensed mortgage/insurance/real estate/investment coordination.
- Managed secret scanning/push protection, independent software
  composition scan, remediation of high-severity dependencies,
  penetration/load/accessibility testing, alert paging, key rotation.
- Real two-tenant signed-in browser validation, staging rollout
  observation, backup/rollback rehearsal, security/legal/firm-license
  sign-off and named release manager authorization.
- Payment collection, settled AR, consolidated statutory accounting,
  real regulated financial execution and other M3-M7 roadmap gaps.

**Do not merge, activate real client processing, assert production
readiness or claim total roadmap completion on development CI alone.**
