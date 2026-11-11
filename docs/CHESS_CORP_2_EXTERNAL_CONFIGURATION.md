# CHESS CORP 2 - exact external configuration and go-live requirements

This configuration file contains only variable names and instructions, never
real secrets. Code is on feature/operations-overview; nothing is deployed.

## 1. Tenant database and identity (required)
- DATABASE_URL: KOBIA PostgreSQL runtime connection URL.
- DIRECT_URL: direct, nonpooling PostgreSQL connection to the intended tenant
  schema (include ?schema=tenant_<slug> for tenant migration status).
- NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: real Clerk publishable key.
- CLERK_SECRET_KEY: real Clerk server secret key.
- NEXT_PUBLIC_DEFAULT_TENANT: selected authorized tenant slug.
- CHESS_PUBLIC_ORIGIN: exact HTTPS origin for the CHESS application.
- CHESS_CONSENT_EVIDENCE_KEY: random unique 32+ character HMAC secret;
  never reuse the Clerk secret.
- Provide Clerk organization, client email verification and matching CRM
  contact records. Configure appropriate regulated electronic-signature
  vendor separately for disclosures requiring enforceable e-signatures.

## 2. Private S3 document storage (required)
- KOBIA_S3_BUCKET: PRIVATE bucket with public access blocked.
- KOBIA_S3_REGION: bucket region.
- KOBIA_S3_ACCESS_KEY_ID: short-lived, scoped credentials.
- KOBIA_S3_SECRET_ACCESS_KEY: secret for that identity.
- KOBIA_S3_ENDPOINT: optional approved S3-compatible endpoint.
- Storage credentials require tightly scoped PutObject, GetObject,
  GetObjectVersion, HeadObject and GetBucketVersioning access. The scan worker
  must read immutable object versions; public access stays blocked.
- **Bucket versioning must be Enabled**, not Suspended. Upload confirmation,
  scanning and download fail closed without a version ID and ETag. This prevents
  a file from being replaced after it has passed malware scanning.
- For S3-compatible storage, verify that versioned HEAD, GET and presigned GET
  all work. Do not use a provider without compatible object-version support.
- Set server-side encryption (SSE-KMS or provider equivalent), key rotation,
  retention/lifecycle, object-versioning, least-privilege IAM, TLS, audit
  logs and an approved data-processing agreement outside the codebase.
- Upload permission is per business/service. Uploads start PENDING, are
  verified against S3 metadata, then QUARANTINED. Only CLEAN objects are READY.

## 3. Malware scanning (required)
- Deploy and secure a ClamAV daemon in a private network with current
  signature updates. No public port exposure.
- CHESS_CLAMAV_HOST: internal DNS hostname of ClamAV daemon.
- CHESS_CLAMAV_PORT: daemon TCP port (default 3310).
- CHESS_SCAN_WORKER_TOKEN: unique random 32+ character secret for the
  machine-only POST /api/chess/scan-worker?t=<tenantSlug> endpoint.
- Set a scheduler to call that endpoint with Authorization: Bearer <token>
  and JSON {"limit":5}; restrict network access and monitor quarantined age.
- CHESS_DOCUMENT_SCAN_KEY: separate random 32+ character HMAC key for an
  OPTIONAL, independently approved external scanner callback.
- CHESS_SCAN_CALLBACK_ENABLED: keep unset or false when using ClamAV.
  The callback is disabled by default. Configure true ONLY with a vetted
  external scanner that signs tenant.timestamp.rawBody and provides trustworthy
  content digests and callback replay protection.
- No scanner success means no document download.

## 4. Payroll execution (required to enable real transfers)
- CHESS_PAYROLL_API_URL: provider's approved HTTPS POST endpoint. The
  implementation expects {id,status:accepted|rejected|pending} and sends
  tenantId,entityId,payRunId,amounts,payDate and Idempotency-Key.
  Provider onboarding must adapt/confirm this exact contract.
- CHESS_PAYROLL_ALLOWED_HOST: exact hostname of approved provider URL.
- CHESS_PAYROLL_API_KEY: provider-issued API token scoped to payroll submissions.
- CHESS_PAYROLL_PROVIDER_CERTIFIED: keep false until signed provider onboarding,
  tested worker and tax filings, bank accounts and ACH authorizations are in place.
- CHESS_PAYROLL_EXECUTION_ENABLED: keep false until formal payroll launch.
- An explicitly approved PAYROLL_EXECUTE action with a digest matching the
  exact POSTED KOBIA PayRun is required before a dispatch.
- Existing legacy payroll withholding fields are labeled placeholders.
  This interface is NOT itself a compliant withholding/tax-filing engine.
  The selected provider MUST independently validate tax calculations, employee
  identities, funding and disbursement instructions before executing payroll.
- Provider status "accepted" means submitted, NOT proof wages were paid.
  Unknown network outcomes must be reconciled with provider; never blind retry.

## 5. Official license registry (required to enable regulated services)
- CHESS_LICENSE_API_URL: contracted official registry access or approved
  aggregator's verified lookup POST endpoint. It must return registryId,
  service, jurisdiction, status, expiresAt, sourceUrl and checkedAt.
- CHESS_LICENSE_ALLOWED_HOST: exact HTTPS hostname for that endpoint.
- CHESS_LICENSE_API_KEY: secure provider API key.
- CHESS_LICENSE_SOURCE_HOSTS: comma-separated official source hostnames
  that are accepted as proof, verified by compliance staff.
- For each professional: full public registry lookup identifier (stored in
  credentialRegistryId), license category, jurisdiction, employing broker/firm,
  and appropriately permitted affiliations.
- Do not mark licenses VERIFIED by hand; the code validates sourced ACTIVE
  results and records an independent admin reviewer. Rechecks expire after
  24 hours. Official registry provider must be selected and configured.
- Mortgage NMLS, state real estate boards, state insurance departments and
  investment adviser/broker registration may require separate provider contracts
  and legal interpretation. A single vendor is NOT assumed to cover all.

## 6. Release validation steps
1. Add these entries under GitHub Environment chess-staging as Secrets or
   Variables, following the sample workflow.
2. In the staging environment with compliant test data, run the manual
   CHESS staging release validation workflow.
3. Confirm PostgreSQL migration status, read-only connectivity checks to DB,
   S3 **with versioning enabled** and ClamAV, full unit tests, production build
   and HTTP auth smoke tests.
4. Test live provider *sandbox* requests and full reconciliation; no real ACH.
5. Run application penetration tests, backup/restore and disaster recovery
   drill, audit event append-only and role-privilege review.
6. Verify broker/employer affiliation, retention and consent legal review.
7. Only after sign-off and approved rollout: migrate each tenant with backups
   and deploy. Never copy real client data into testing.

Staging validation is a preflight, not a deployment. External provider credentials,
legal/compliance authorization and production infrastructure are NOT provisioned
by GitHub commits.
