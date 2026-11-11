# CHESS CORP 2 - Security operations and release evidence

**State: DRAFT, not an executed incident plan or a deployment approval.**
KOBIA is the independent multi-tenant host. CHESS business units operate
inside a single scoped tenant; no business-unit label proves legal authority.

## Incident response (requires independently named owners)

1. Designate an incident commander, security responder, separate compliance
   decision-maker, and secure evidence custodian. Maintain private, reachable
   escalation contacts outside Git.
2. On suspected credential exposure, disable affected workers and vendor
   routes, preserve append-only tenant audit metadata, revoke/rotate the
   credential with its provider, and investigate both Git history and access
   logs. A Git commit does **not** erase an exposed secret.
3. On cross-tenant/cross-business access, suspend the affected endpoint,
   invalidate impacted sessions/grants, and investigate source and archive
   audit events without copying personal records into tickets.
4. For payroll, invoice, calendar or regulated provider uncertainty, disable
   outbound dispatch. Preserve the idempotency key and check read-only
   provider status; NEVER blindly resend an UNKNOWN transmission.
5. Record severity, UTC timeline, scope, containment, owner, notification
   obligations, evidence custody and independent closeout in a protected
   incident system. Automatic paging is NOT currently configured.

## Implemented, bounded controls

- ACTIVE Clerk membership plus business and client-service grants is
  required by CHESS APIs, subject to additional independent E2E review.
- AI triage is generic, advisory and human-reviewed. Invoice delivery needs
  three distinct active people and does not charge a client or post revenue.
- Database security events are immutable after insertion; audit archive
  receipts are immutable after confirmed ARCHIVED delivery. The external
  archive gateway has not been validated.
- The tenant-local M8 `ChessRequestRateWindow` table is written
  transactionally with both tenant and actor quotas; identities are
  SHA-256 pseudonymized with tenant/purpose separation. A missing migration,
  unavailable database, or failed quota claim blocks the request. HTTP 429
  returns Retry-After. The private recurring worker deletes at most 500
  expired windows per run (seven-day retention).
- CI checks common live-token patterns in tracked text files. This is a
  partial rule set, **not** comprehensive secret scanning; configure managed
  GitHub push protection and separate vendor security checks where possible.

## Key management and record retention

Keep independently scoped credentials for Clerk, database, storage,
scanner, AI, billing, calendars, payroll, bank data, licensing and all
regulated gateways in a secret manager. Use least privilege, key owners,
rotation deadlines and recorded approvals. CHESS consent and audit HMAC
rotation currently requires a migration/evidence-verification plan so
old proof does not become unverifiable. No automatic historical-key
migration is claimed. Retention, legal hold and deletion must be approved
service by service, especially for tax, payroll and regulated businesses.

## Staging migration, rollback and recovery

1. Freeze the commit SHA, per-tenant schema revision, runtime variables,
   worker flags and external API contracts. Validate migration compatibility
   against each existing CRM and accounting tenant.
2. Take and independently verify a compliant immutable encrypted backup.
   Run additive migration rehearsal on an isolated synthetic clone and
   verify record counts, audit triggers, grants and financial balancing.
3. Rehearse application rollback to the preceding approved commit against
   the **expanded** schema; do not automatically drop financial data or
   remove immutable audit evidence. App rollback and DB rollback are distinct.
4. Run real signed-in, two-tenant/two-business tests with role changes,
   service grants, consent withdrawal, CSRF and record access denial.
5. Complete real provider sandbox reconciliation, manual accessibility,
   performance, dependency/vulnerability and independent penetration audits.
6. Restore an independent database from a versioned, locked backup;
   validate app startup, ledger reconciliation, RPO and RTO with measured
   UTC timings and a signed witness. The existing protected DR workflow only
   reads an externally restored database; it does not perform the restore.

## Production authorization checklist

- [ ] Protected staging deployed and full integration pilot observed
- [ ] All per-tenant migrations, rollback compatibility and backups passed
- [ ] Real provider sandboxes, consents and retention controls verified
- [ ] Clerk users, business grants and multi-tenant E2E cases passed
- [ ] Managed secrets, rotation, incident paging and monitoring approved
- [ ] Penetration, performance, accessibility and disaster recovery signed
- [ ] Appropriate individual/firm licenses and affiliations independently checked
- [ ] Legal/privacy/security approvals recorded by authorized reviewers
- [ ] Named release owner explicitly approves production cutover

**Do not merge, enable production workers, or process real regulated client
data until every applicable release gate is independently verified.**


## Round 10 development-only release validation

See `docs/CHESS_CORP_2_M8_ROUND10_ACCEPTANCE.md` for confidential
configuration placeholders and required independent evidence.

Use a pinned release SHA, private staging deployment with synthetic
data, protected attestation token, exact approved HTTPS hostname,
owner-approved E2E sessions for two tenants, and a fully isolated
read-only database restore from an independently provisioned locked,
versioned backup. The revised manual staging workflow checks the actual
deployed SHA and dependency vulnerabilities but does not deploy code.
The revised DR verifier rejects an unprivileged-evidence-account bypass,
missing audit triggers, a witness newer than the snapshot, impossible
recovery timestamps, or operator-reported metrics outside targets.

**No release approval, signed DR evidence, staging deployment, live
vendor check or independent penetration test has been performed by
writing these code and runbook files.**
