# Round 14 - M1-02 / M8-09 client service read audit acceptance

**Status: Development implementation on draft PR #24 only; CI, real
provider evidence and deployment must be assessed separately.**

## Purpose and exact scope

The CHESS client profile and service API already maintained explicit
individual grants and append-only `SERVICE_GRANT_UPDATED` /
`SERVICE_GRANT_REVOKED` events. Before this round, its
`getClientServiceLink` reader returned or denied sensitive service
links without committing an explicit read decision.

The Round 14 helper adds a tenant-local transaction covering the
specific service link lookup, effective service grant check and an
append-only security event. This applies whether a link is allowed,
denied or absent. Absence is logged as DENY with a null resource ID
so user-input guesses and private client IDs never appear in the log.

Success returns only the preexisting restricted service-link fields,
and only **after** the audit event has committed. A failed audit
write means no link is returned. Authorized clients cannot use
a business-unit or CRM administrator role to bypass an individual
service grant. Revoked grants remain denied.

Events:
- `CLIENT_SERVICE_LINK_READ` / `ClientServiceLink`
- `decision=ALLOW` or `DENY`
- server-side `businessId`, `actorClerkUserId` and the existing
  opaque `linkId` only, if that link actually exists
- DB-managed `occurredAt`; no client contact name, email, content,
  bank account, KYC, original requested URL or raw provider ID

Unit tests check the privacy-limited event schema and denied missing
resource. Tenant PostgreSQL integration tests create fictional
profiles, business units, links and grants, exercise no-grant,
nonexistent link, granted access and revoked grant, then verify
decision counts and reject edits to immutable audit events.

## Remaining work / explicit limitations

This is not a full system-wide access-audit review and does not
independently guarantee strict serializability with concurrent
revocation. Sensitive consent, document, tax, finance, regulated
handoff, billing, AI and provider endpoints require separate
per-path audit coverage, verified session evidence and threat
modeling. Permission to read a client profile does not by itself
authorize any service record.

**Do not claim M1-02 or M8-09 closed until:**
1. Real Clerk sessions exercise owner, admin, active member,
   suspended/viewer, revoked grant, wrong business and cross-tenant
   scenarios on two independent fictional tenant databases.
2. Audit insertion failure is fault-injected in staging and verified
   to prevent service-read responses (not just logged).
3. The immutable audit stream reaches an independent WORM archive,
   with signed/pinned provider receipts, retention policy and
   monitored retry/paging on failures.
4. All other sensitive access paths are reviewed and audited,
   privacy/legal retention and erasure policies are signed off,
   and an independent security/penetration review passes.

## External values the owner must supply

Use existing `docs/CHESS_CORP_2_EXTERNAL_CONFIGURATION.md` settings,
including the approved tenant `DATABASE_URL` /`DIRECT_URL`, managed
Clerk sandbox keys, HTTPS `CHESS_PUBLIC_ORIGIN`, audit archive gateway
HTTPS allowlist and token/receipt verification secrets, archive WORM
retention contract, least-privilege tenant role, approved retention
policy and fictional test client/member accounts. No new secret is
required just for locally committed audit events. Never commit live
keys or grant real regulated access before final approval.

**Production hold:** PR #24 stays draft and unmerged; CI's green state
does not authorize a staging deployment or release of sensitive
client data.
