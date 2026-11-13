# CHESS CORP 2 — Round 52 distributed public form anti-abuse

**Working branch:** feature/operations-overview (draft PR #24, unmerged).
**Production:** main and Vercel unchanged. No vendor/Clerk credentials used.

## Scope and mechanisms

- Two public submission routes: \`/api/forms/[slug]/submit\` (web-to-lead),
  and \`/api/f2/[slug]/submit\` (Forms 2.0). Both must resolve an ACTIVE
  platform tenant and exact schema before any tenant DB operation.
- Legacy memory maps are removed. Per-minute atomic quotas use the existing
  migrated tenant \`ChessRequestRateWindow\` in PostgreSQL, with tenant,
  form, and trusted-visitor buckets all incremented transactionally;
  a rejected quota rolls back increments. This works across app replicas
  sharing the same tenant database. The secrets/HMAC digest mean no raw
  visitor IP is persisted in these counters.
- Allowed quotas: 120 per tenant, 40 per form, 8 per trusted visitor,
  3 per unknown visitor each UTC minute. Requests exceeding them return
  429 with Retry-After 60; no submission is created.
- Only explicitly approved edge-overwritten request headers can supply
  visitor IP identity. Arbitrary X-Forwarded-For/forwarded chains do not
  create multiple subjects; if the header is missing/invalid, quota tightens.
- 32 KiB body ceiling, safe parse/field type checks, optional legacy
  honeypot, and a one-time Turnstile challenge verified against Cloudflare
  Siteverify using required \`success\`, exact action (bound to form kind,
  tenant and form slug) and allowlisted hostname. Provider/network errors
  and missing credentials cause fail-closed responses before inserts.
  Server never persists the Turnstile token in CRM records.
- Both hosted form clients render an explicit public-site-key widget,
  disable submission without a token, and reset after a failed attempt.
  Service secret and rate HMAC are never rendered or sent to the browser.

## Validation

- Policy unit tests exercise disabled/missing configs, malformed
  untrusted IP headers, privacy HMAC separation, action scoping, failed
  and forged Siteverify responses, provider outage and body limits.
- Disposable PostgreSQL integration exercises two distinct Prisma
  clients concurrently on the same tenant schema with exact visitor
  quota and unknown-user isolation. It uses no real vendor credentials.
- Source drift gate rejects process-local maps/unverified submit routes.
  Three normal CI jobs must pass on final exact SHA.

## Limits / independent acceptance

This is not a bot-proof guarantee. Shared NAT traffic may hit visitor
limits; large distributed floods can still consume database capacity;
rate retries are not a replacement for edge/WAF controls and an
independent abuse/load test. The Cloudflare widget and
\`CHESS_PUBLIC_FORM_ABUSE_ENABLED\` flag are unset by default, so
new public submissions deliberately fail closed until approved.
The operator must supply Cloudflare test/siteverify credentials,
hostnames, edge IP header provenance and a private HMAC key. Tenant
migration status and a hosted two-tenant test must be witnessed.
The existing HTTP analytics, booking, unsubscribe and other public
capability paths are **not** included in this form-submission scope.
No regulated client processing, financial action, merge or deployment
is authorized; 8/8 production milestone gates remain BLOCKED,
0/8 independently signed off.
