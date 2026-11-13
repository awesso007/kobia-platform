# CHESS CORP 2 — Round 37: historical read authorization inventory

**Branch:** `feature/operations-overview` | **PR:** [draft #24](https://github.com/awesso007/kobia-platform/pull/24), unmerged.  
**Production:** `main` and `kobia-platform.vercel.app` must not change.
**KOBIA boundary:** independent multi-tenant platform; CHESS is its first
full-service tenant, not a merger of legal/licensed businesses.

## Baseline

Round 36 final source commit
`3d113b05f15fc686ef1f3a5d91aaf66e33e60cb1` passed
**3 of 3** GitHub Actions jobs in
[run 43270152248](https://github.com/awesso007/kobia-platform/actions/runs/43270152248):
build/lint/type/unit/security smoke, tenant PostgreSQL and legacy ledger PostgreSQL.

## Source security remediations

| Scope | Code-only improvement | Limit |
| --- | --- | --- |
| Legacy general-ledger and trial-balance CSV | Live tenant/role/entity check, finance-only OWNER/ADMIN/ACCOUNTANT role, journal/account SELECT and privacy-minimal AuditLog transaction coupled at SERIALIZABLE isolation; no-store headers and strict report dates. Trial balance now filters POSTED journals. | This is the **legacy** platform schema, not the separate CHESS ledger. External immutable receipts, book-close review, and actual role-race staging still open. |
| Historic email account/message/thread/draft reads | Empty/unknown actor can no longer fall back to tenant-wide mailbox access. Owner email account is rechecked inside a serializable membership/SELECT/audit transaction for four sensitive GET routes. | Other historical mail metadata and UI/server-action paths need audit review; single transaction does not independently prove actual Clerk sign-in. |
| Historic document/file download | Direct document download requires fresh OWNER/ADMIN membership and audited document selection. Local fallback requires a 60-second HMAC bearer capability and READY-only transactional SELECT/audit; guessed storage keys fail closed. | Pre-issued links may remain usable until expiry. LOCAL fallback requires a protected `KOBIA_LOCAL_DOWNLOAD_SIGNING_KEY`; private S3/KMS/WORM acceptance and document ACL refinement remain open. |
| Historic file-share links | Public share capability validates password, expiry and READY status; capped count consumption and privacy-minimal ALLOW/DENY are committed together. Redirects are no-store and LOCAL links are short-lived. | Public link still is a bearer capability; password-in-query and independent storage/provider privacy controls need future work. |
| Historic form-submissions and workflow-run detail | OWNER/ADMIN-only current membership rechecked transactionally, with immutable tenant event and selected source data in same snapshot. | Does not assert complete forms/workflow pages, all GET and server action coverage. |
| Legacy support/helpdesk portal | Old "type a contact email to receive a session cookie" authentication and its old cookie reads now fail closed; direct API and two server-rendered ticket views show unavailable, without exposing client tickets. | Must replace with real verified email challenge, one-time token, authenticated portal audit, legal terms and staging acceptance before reactivation. **No flag can re-enable the insecure email-only path.** |

### Tests and inventory

Added tests for new historical tenant audit helper (fresh roles,
audit failures, privacy-minimal audit), tax year and date parsing,
local HMAC forgery/expiry/no-secret cases, null mail ownership,
unverified portal rejection, and critical-path source markers.

[Complete **non-CHESS API route-file inventory**](CHESS_CORP_2_ROUND37_HISTORICAL_ROUTES.json)
lists **162 historical `/api` route files**. Each is explicitly categorized
as a guarded source subset (13), disabled unverified session (3),
machine/callback requiring review (26), public capability requiring review
(9), or general path requiring read/write review (111). The inventory
covers **route files, not a count of sensitive GET endpoints**. Many
unreviewed routes are writes and not sensitive read endpoints; other
sensitive reads may be in tRPC, server components, server actions or page
handlers outside the manifest. Do not infer a vulnerability in every
unreviewed route or assume a guarded route is independently certified.

The `scripts/check-round37-route-inventory.mjs` CI pre-test prevents
silent API route addition/removal and confirms guard markers for the 13
selected paths and deny-by-default markers for the 3 legacy portal
routes. Static markers are **not** transactional authorization proof.

## Outstanding code-only security work

- Examine every historical GET, report, mail, portal, file, callback,
  tRPC procedure, server component, and server action for direct SELECTs
  outside live transaction-coupled access decisions. The manifest alone
  does not satisfy this audit.
- Finish document-level authorization/hold/scan and immutable audit
  receipts; avoid releasing URLs before legally approved policies.
- Model financial cross-database consent and journal UNKNOWN races with
  durable fault injection. This is distinct from historical reporting.
- Replace disabled legacy helpdesk email-only login with a proven
  one-time verified-email or equivalent gateway, and test under real
  Clerk/protected staging identities without live customer data.
- Audit historical callback, public-capability and cron boundaries
  independently; automation worker secrets are not a substitute for
  client read authorization.

**No blanket claim of full sensitive-read coverage is warranted.**
Remaining code-only review work and all independent acceptance are open.

## Owner-supply and release decision

The single canonical owner list remains
[the 18-group checklist](CHESS_CORP_2_OWNER_SUPPLY_CHECKLIST.md).
The new protected LOCAL signer is listed under **05** (server-side vault),
and verified customer portal identity under **04/17/18**.
Existing storage, legal privacy, Clerk/staging, WORM/PITR and independent
review groups remain incomplete. Never include secrets in this repository.

**8/8 milestones still blocked from production; 0/8 independently
approved.** The final Round 37 commit requires an exact final-head 3/3
GitHub Actions confirmation before the round is called CI-verified.
Neither green CI nor test-only source logs authorize merging or deployment.
