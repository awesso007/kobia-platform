# CHESS CORP 2 — Round 58: transaction-coupled sensitive reads

**Branch:** \`feature/operations-overview\`; **draft PR:** #24.
Do not merge or deploy; KOBIA remains the independent multi-tenant platform.

## Interrupted Round 57 recovery

Round 57's exact last commit before this round was
\`ad15bfef1a2ef3694bb62430bf5b354f909b678f\`.
Its normal [Actions run 43355891168](https://github.com/awesso007/kobia-platform/actions/runs/43355891168)
passed **build**, **chess-db-integration** and
**chess-legacy-ledger-integration** on that SHA. No repair of the prior
commit was necessary. Round 57's 33 authenticated historical REST route
files / 44 methods and separate transaction-bound tRPC mutation audit are
source changes; neither certifies unrelated public/machine callbacks.

## Round 58 source changes

1. **Historical CRM server-rendered queries:** Added
   \`src/lib/chess/historical-server-read-round58.ts\`, wrapping **71
   query entrypoints across 13 CRM query modules**: activities, quotes,
   marketing, audit log, automations, chat (3 sensitive reads), documents,
   feed, helpdesk, mail, sites, workgroups and reports. Prior Round 50
   accounted for authenticated REST GET and read-only search; it did NOT
   automatically cover these server-rendered page loaders.
2. **Project/task loaders:** Five sensitive project/team/task query
   helpers now use the same audited read boundary, including direct
   server-action \`loadTaskDetail\` which delegates to the bound helper.
   Internal \`getMembersLite\` calls use the same SELECT transaction
   rather than opening a nested or independent read audit.
3. **Telephony server actions:** \`listPhoneNumbers\`, \`listMembers\`
   and \`listRules\` require live telephony:manage permission and an
   atomic sensitive-read boundary before returning private number,
   routing or employee directory data. These are browser-invokable
   server actions, not REST GET methods.
4. **Conservative authorization:** Every wrapped read begins a
   \`Serializable\` tenant transaction and calls
   \`liveLegacyLeadActor\`, which rechecks ACTIVE membership and
   refuses a tenant with more than one ever-created business unit
   (including inactive historical units). OWNER/ADMIN alone can
   access these legacy-wide views. MEMBER/VIEWER cannot infer that
   owning one CRM record grants access to every client's information.
5. **Every relevant service grant:** The transaction checks that NO
   ClientProfile is missing its serviceLinks and that EVERY
   ClientServiceLink belongs to the single active business and carries
   the querying principal's unrevoked \`canRead\` grant. A partially
   granted employee, or an owner lacking explicit service authority,
   cannot export other clients through a broad list, aggregate,
   related-record picker or report. This intentionally disables some
   historic tenant-wide views until legal sharing mappings and grants
   are reviewed/backfilled; it does not silently return partial
   aggregates with misleading totals.
6. **SELECT and audit commit:** \`withHistoricalTenantReadScope\` binds
   original \`getTenantDb\`/\`getTenantPrisma\` reads to that same
   transaction. If the helper bypasses the bound tenant query, loses
   its grant, hits a serialization error, fails to insert the
   privacy-minimal \`ChessSecurityEvent\`, or fails to commit, it
   throws without releasing the requested data.
7. **Existing narrow exceptions:** \`chat.currentUserId\` returns
   only the current member ID; it is not a broad database read.
   \`reports.runReport\` is separately wrapped for standalone calls;
   a caller supplying a transaction client is the previously
   authorized \`previewReport\`, which denies protected-client-wide
   exports in its own audited serializable transaction. Existing
   Round 54–56 per-record Lead/Contact/Deal/Company helpers retain
   their finer owned-record and grant checks.
8. **Regression and CI source gate:** Added mock-unit tests for denied
   member, revoked grant, unassigned profile, foreign business,
   sensitive audit failure and unbound SELECT. Added actual
   disposable PostgreSQL tests with two independent Prisma clients
   for missing/revoked grants, read+audit commit and failure rollback.
   The CI regression preserves audit receipts rather than trying
   to DELETE the database's intentionally append-only events.
   A separate Round 58 source gate protects 79 audited read
   entrypoints: 71 CRM, five project/task and three telephony.
   **Green CI must be checked at the final commit before marking
   any of these items verified.**

## Limits / external owner inputs

- No new third-party secret or credential is needed to compile the Round
  58 tenant code; reuse the existing Clerk and Neon protected staging
  credentials, explicit business/service authority records, audit
  archival credentials and approved private log delivery under the
  canonical owner checklist.
- Supply verified legacy Lead, Contact, Deal, project, phone and client
  records' true business/client/service mappings. Grant
  \`ClientServiceGrant\` rights only after lawful client authority
  is documented. Do NOT create fake blanket grants to work around
  fail-closed pages or silently drop historical inactive business units.
- Execute authenticated two-tenant and multi-business protected
  staging tests with revoked grants, MEMBER/VIEWER, many-client
  fixtures, audit event database outage and race conditions.
- Query helpers outside the enumerated 13 CRM modules and project/task
  /telephony set, direct Next server component Prisma queries,
  external provider callbacks, private archive/WORM evidence and legal
  data-sharing acceptance are NOT certified by this scope. Source
  inventory gates do not replace signed-in hosted penetration tests.
- The production release matrix remains **8/8 blocked, 0/8 independently
  signed off**. Draft PR #24 stays unmerged and production \`main\` and
  KOBIA hosting unchanged.

**Final exact SHA CI evidence:** see the last verified run in draft PR
#24 after the final Round 58 commit; do not substitute a prior passing
SHA for later changes.
