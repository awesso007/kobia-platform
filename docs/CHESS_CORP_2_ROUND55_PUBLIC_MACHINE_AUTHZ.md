# CHESS CORP 2 — Round 55 recovery and public/machine authorization

**Scope:** \`feature/operations-overview\`, draft PR #24 only. Do not merge or deploy.
The CHESS tenant remains a separately licensed/consented operating-services layer
in the independent KOBIA platform. This is source security work, not production
release authority.

## What the interrupted Round 54 actually left in GitHub

On resuming Round 55, branch HEAD was
\`0ecf4b72ab5a0be6174b20dda856da3073f48a99\`. Both disposable
PostgreSQL jobs were green, but the **build failed** with a TypeScript error
in the e-signature test's recursive mock annotation. Round 54 had committed
opaque AES-GCM unsubscribe capabilities, exact recipient-bound suppression,
published public KB feedback, atomic sequential e-sign state/audit, signed
Twilio account/body checks, SMS/email provider replay constraints, safer public
reschedule, a new historical gate, and an initial legacy-lead security helper.
The lead UI/actions and business/callback source review were not finished.

## Round 55 changes

1. **Interrupted build repaired.** Fixed the e-sign mock annotation, followed
   by TypeScript fixes for the public lead form's string interface and
   Prisma list filter narrowing. Failed source/tool attempts were NOT committed.
2. **17 authenticated cron jobs:** All 17 inventoried machine cron routes
   require exact CRON_SECRET before any work (earlier gate) AND independently
   re-read the registry just before each tenant operation. A tenant must be
   ACTIVE and have the exact schema derived from its safe slug. An inconsistent
   or revoked tenant is skipped, not redirected to the requested schema.
3. **Five Twilio machine callbacks:** Maintain exact Twilio signature,
   account SID, body size/duplicate-field limits and active registry checks
   from Round 54. Add a fail-closed cross-business guard on callbacks:
   legacy PhoneNumber, SMS and Call records have no businessId. If more
   than one business was ever registered in that tenant (even if one is
   now inactive), do not process those callbacks pending per-number ownership
   migration. The inbound SMS write path rechecks this inside its
   SERIALIZABLE transaction before any message, lead or counter writes.
4. **Inbound mail relay:** The existing exact 32+ byte relay secret, ACTIVE
   registry and ACTIVE addressed mailbox remain mandatory. Round 54
   added a bounded JSON body, replay-safe Message-ID and transaction;
   unscanned attachments are denied. Round 55 requires the single-business
   predicate before and during the transaction, and no longer links CRM
   clients or dispatches client automations using an unverified, spoofable
   sender From address. References can reuse only same-account, same-sender
   prior messages. Operator review is required before client linkage.
5. **CRM leads:** Legacy Lead and related tag/custom-field rows have no
   businessId. Rather than guess ownership, the lead directory, Kanban,
   detail and create/update/stage/convert actions fail closed in tenants
   with more than one ever-created business. Live ACTIVE member status and,
   for MEMBER, an active single-business assignment plus record ownership
   are rechecked inside the same SERIALIZABLE transaction that SELECTs
   or mutates records and appends a privacy-minimal ChessSecurityEvent.
   Lead conversion (Contact+Deal+Activity+Lead status) and tag/custom-field
   mutations are transaction-coupled. External search, notification and
   automation side effects run only after commit. Other legacy CRM modules
   without businessId are NOT yet covered.
6. **Regression tests and CI:** Unit coverage for live role and revoked
   assignment, multi-unit and inactive-unit denial, audit-release failure,
   malicious canonical schema selection and machine business guard. The
   Round 54 provider-replay dual-PostgreSQL regression remains in the normal
   disposable DB job. A new Round 55 source gate enumerates all 17 crons,
   5 Twilio callbacks, inbound mail, and covered lead operations, and is
   registered in normal CI. Source gates alone are not hosted acceptance.

## Release boundaries and owner-supply

New secure configuration already required by Round 54/55:
\`CHESS_UNSUBSCRIBE_ENCRYPTION_KEYS\` (comma-separated **64 hex digits** per
AES-256 key, current key first and retained prior keys during planned rotation,
vault-only), plus \`NEXT_PUBLIC_APP_URL\` set to the verified HTTPS origin.
Without the encryption key, outbound marketing email is blocked rather than
sent without a recipient-owned opt-out capability. Legacy previously sent
unsigned email links cannot self-authenticate; owner support must provide a
verified manual unsubscribe path and replace/reissue those links as needed.

Retain \`CRON_SECRET\`, \`TWILIO_ACCOUNT_SID\`,
\`TWILIO_AUTH_TOKEN\`, \`EMAIL_INBOUND_SECRET\`,
\`EMAIL_INBOUND_DOMAIN\`, \`CHESS_PUBLIC_FORM_RATE_HASH_KEY\`,
\`CHESS_PUBLIC_FORM_TRUSTED_IP_HEADER\`, approved provider callback
hostnames, TLS/reverse-proxy hardening and all existing separate staging
credentials from the canonical owner checklist. Do not paste secret values
into source, issues, comments or ChatGPT.

Before applying the new unique provider-replay indexes in a non-disposable
database, inspect duplicate historical \`SmsMessage\` provider SIDs and
\`EmailMessage\` (account, direction, Message-ID); resolve conflicts through
approved retention and audit review, not automatic deletion. Prove signed
Twilio/provider callbacks in vendor sandboxes, post-commit side effects and
outbox failure recovery, exact tenant and wrong-provider rejection, inbound
mail replay/attachment denial, and legitimate unsubscribe accessibility.

**Future engineering remains:** businessId backfill for historic CRM Leads,
Contacts, Deals, phone numbers and mail accounts; business/client-grant
authorization across other legacy server actions and tRPC callers; complete
transaction-coupled webhook status/audit, durable provider outboxes,
cross-tenant and multi-business protected Clerk/Neon staging tests, and
independent legal/security/DR/vendor attestation. Normal CI never establishes
any of those third-party approvals.

**Production release status:** 8/8 milestones BLOCKED, 0/8 independently
approved. \`main\` and \`kobia-platform.vercel.app\` remain unchanged.

**CI:** See the final exact-SHA GitHub Actions evidence linked in draft
PR #24. An earlier passing run is not evidence for later commits.
