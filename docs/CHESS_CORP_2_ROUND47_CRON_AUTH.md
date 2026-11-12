# CHESS CORP 2 — Round 47 legacy machine scheduler authentication

**Scope:** Branch `feature/operations-overview` / draft PR #24 only.
Independent KOBIA platform; CHESS is a tenant. Not merged or deployed.

## Existing bug and code fix

The historical Round 37 inventory listed **17 scheduled `/api/cron`
routes** among the 26 machine/callback review items. These routes
previously exposed unauthenticated GET entrypoints that enumerate ACTIVE
tenants, perform scheduling/notification/automation work and in some cases
return tenant-specific summaries. This allowed an external caller to start
work without a scheduler credential.

Round 47 adds a shared `requireKobiaCronAuth(req)` check as the **first
executable statement** in each of the 17 GET handlers. It rejects missing
or under-32-byte `CRON_SECRET` with 503 and absent/incorrect Bearer
headers with 401. Both are no-store and expose no secret. Fixed-length
SHA-256 digests are compared with `timingSafeEqual` to avoid
secret-dependent prefix comparisons. Only an exact
`Authorization: Bearer <CRON_SECRET>` admits work.

New local Vitest cases: absent/weak secret; wrong case/scheme/whitespace,
bad prefixes/suffixes, missing bearer and Clerk cookie bypass; exact
authorized bearer. The new CI source-policy gate scans all
`src/app/api/cron/*/route.ts` files, compares them against
`vercel.json` and rejects any unguarded first statement or unreviewed
HTTP mutation method. The regular build job invokes this gate.

## Boundaries and operator evidence required

No secret was added to this branch; all 17 scheduled jobs will remain
disabled until the owner supplies the fresh strong server-only
`CRON_SECRET` to a protected staging deployment. Vercel's Cron system
uses this secret in the Bearer header. Missing configuration is an
intentional fail-closed outcome, not a successful scheduler run.

This step protects entrypoint admission only. **It does not prove**
tenant authorization within each job, idempotency, outbound provider
restrictions, abuse controls/rate limits, replay protection, task-level
transaction isolation, immutable audit, actual staged cron delivery or
the safety of the other 9 machine/callback/public-capability endpoints.
Those require path-by-path review, production-safe policy and protected
realistic run evidence. No CHESS money, payroll, regulated/provider, document
purge or consent feature gate was enabled.

The exact final documentation commit still requires green ordinary CI
(build/typecheck/lint/unit/security plus two PostgreSQL integration jobs).
Normal CI does not execute a protected Vercel Cron or deploy `main`.
Until that is independently witnessed and security review signs off,
**M8 remains PARTIAL CODE — BLOCKED; all 8 production milestones are
blocked, none signed off**.

See `docs/CHESS_CORP_2_OWNER_SUPPLY_CHECKLIST.md` group 02/15/17/18.
