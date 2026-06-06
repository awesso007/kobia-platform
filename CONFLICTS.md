# Sprint 1 Foundations - Tenancy Conflicts

Status: BLOCKING. Documented per Sprint 1 constraint ("If the existing repo
uses a tenancy approach that conflicts with schema-per-tenant, document the
conflict in a CONFLICTS.md file and ask before proceeding").

Branch: sprint-1-foundations (created off main @ efe2753)

---

## Conflict 1: existing repo is row-level, locked decision is schema-per-tenant

### Current state (row-level / shared public schema)
- Every business table lives in `public`.
- 166 references to `tenantId` across `prisma/schema.prisma`.
- Platform tables (`Tenant`, `User`, `Membership`, `Subscription`, `ApiKey`,
  `AuditLog`) live in the SAME schema as business tables.
- Business tables hold a foreign key back to `Tenant`:
  `tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)`
  (confirmed on Entity, Subscription, ApiKey, AuditLog, and ~dozens more).
- Tenant is resolved from the URL path slug (`/[tenant]/...`) plus a
  `Membership` lookup. See `src/lib/auth.ts:getAuthContext(tenantSlug)`.

### Target state (schema-per-tenant, locked June 5 2026 in KOBIA_ROADMAP_v2.md)
- `public` holds ONLY platform tables: tenant registry, users, memberships,
  platform billing, platform audit.
- Each tenant's business tables live in `tenant_<slug>` schema.
- Business tables must NOT carry a `tenantId` column (the schema IS the
  tenant) and must NOT FK to `public.Tenant`.

### Why this is not a "change the schema target" one-liner
The instruction says "Keep the model definitions, only change the schema
target." That is not sufficient because:

1. Prisma's `postgresql` datasource binds a single client to a single
   `?schema=`. You cannot have one generated client span both `public`
   (platform) and `tenant_<slug>` (business) with cross-schema relations the
   way the current models are written.
2. The current business models FK to `public.Tenant`. A table in
   `tenant_acme` cannot hold a Prisma-managed relation to `public.Tenant`
   without Prisma multi-schema mode, and even then a per-tenant FK to a
   single shared parent is the wrong shape for true isolation.
3. The 166 `tenantId` columns become dead weight (and a footgun) once the
   schema provides isolation.

### Required approach (recommended)
Split into TWO Prisma schema files / TWO generated clients:

- `prisma/platform/schema.prisma` -> generated to a `platformDb` client,
  bound to `public`. Models: TenantRegistry, User, Membership, Subscription,
  ApiKey, PlatformAuditLog. (Reuses Clerk + Stripe wiring untouched.)
- `prisma/tenant/schema.prisma` -> generated to a `tenantDb` client, bound at
  runtime to `tenant_<slug>` via connection string `?schema=tenant_<slug>` or
  `$extends`. Models: the ~65 business models with `tenantId` and the
  cross-boundary FK to Tenant REMOVED.

This is a real refactor of `prisma/schema.prisma` (2,286 lines), not a target
swap. It is doable but it is the bulk of Sprint 1 and it rewrites the data
model that all existing accounting code depends on.

### DECISION NEEDED (1a)
Confirm the two-client split above is the intended approach. Specifically:
- (A) Proceed with two Prisma schemas / two clients (recommended, true
  isolation, matches locked decision). Existing accounting code will not
  compile against the tenant client until its `tenantId`/`db` references are
  updated - we keep accounting hidden behind the flag and do NOT refactor it
  this sprint, so it stays dormant (no runtime use) but its imports of the old
  `db` singleton remain. We will keep the old `src/lib/db.ts` + old
  `prisma/schema.prisma` intact for the hidden legacy code, and add the NEW
  platform/tenant schemas alongside. Legacy stays on row-level; new CRM is
  schema-per-tenant. This avoids touching dormant accounting code.
- (B) Single multi-schema Prisma client (Prisma `multiSchema` preview) with
  business models tagged `@@schema("tenant_x")` - does NOT support dynamic
  per-tenant schema names, so it cannot actually deliver schema-per-tenant.
  Not recommended; listed only for completeness.

Recommended: (A). It is the only option that delivers the locked decision
without rewriting the dormant accounting modules this sprint.

---

## Conflict 2: Clerk Organizations are not wired

Sprint 1 spec asks middleware to "resolve the active org -> tenant row" and
the top bar to show a "tenant switcher (from Clerk orgs)".

Finding: the codebase does NOT use Clerk Organizations anywhere.
`grep -rl "orgId|organization|clerkOrg|clerk_org" src/` returns nothing.
Tenancy today is slug-in-URL + Membership, with no Clerk org concept.

### DECISION NEEDED (2)
Pick how the active tenant is resolved:
- (A) Adopt Clerk Organizations now: enable Orgs in Clerk, map one Clerk org
  to one tenant via `clerk_org_id` on the registry (the registry column the
  spec already asks for), resolve active org from the session. This is the
  cleanest long-term and matches the spec text, but requires enabling Orgs in
  the Clerk dashboard (a Wiyao action) and a Clerk plan that includes Orgs.
- (B) Keep slug-in-URL resolution for Sprint 1 (no Clerk Orgs yet): registry
  still stores a nullable `clerk_org_id` for later; tenant switcher lists the
  tenants the user has Membership in. Less work, no Clerk dashboard change,
  defers Orgs to a later sprint.

Recommended: (B) for Sprint 1 (keeps moving without a Clerk dashboard change),
with the registry carrying `clerk_org_id` nullable so (A) is a later drop-in.

---

## Conflict 3: no DIRECT_URL for migrations against Neon

`DATABASE_URL` points at a Neon POOLED endpoint
(`...-pooler.c-3.us-west-2.aws.neon.tech`). Prisma migrations / raw DDL
(CREATE SCHEMA, etc.) require a DIRECT (non-pooled) connection. There is no
`DIRECT_URL` in `.env` / `.env.local`.

Per the Sprint 1 constraint ("If Neon connection string is not in env locally,
generate a clear list of env vars the user needs to set and stop before
running migrations. Do not invent credentials."), provisioning against Neon
for tenant `acme` is BLOCKED until the env vars below are set. I will build the
scripts and have them fail-fast with a clear message if the vars are absent.

---

## Env vars the user must set (before migrations / provisioning)

Add to `.env.local` (do NOT commit real values):

```
# Direct (non-pooled) Neon connection - REQUIRED for migrations + CREATE SCHEMA.
# Neon dashboard -> Connection details -> toggle OFF "Pooled connection".
DIRECT_URL="postgresql://<user>:<pass>@ep-spring-queen-akhelyi0.c-3.us-west-2.aws.neon.tech/neondb?sslmode=require"

# (Pooled, already set) used by the app at runtime:
# DATABASE_URL="postgresql://...-pooler.../neondb?sslmode=require"

# If adopting Clerk Organizations (Decision 2A) - already have Clerk keys;
# additionally enable Organizations in the Clerk dashboard. No new env var
# strictly required, but confirm the Clerk plan includes Orgs.
```

If you want provisioning to run against a separate Neon dev BRANCH (safer than
the main branch), also provide that branch's DIRECT connection string and tell
me to use it.

---

## What proceeds without a decision (non-destructive, started now)
- Design tokens (`src/styles/tokens.css`) from BITRIX24_UX_SPEC.md.
- CRM shell scaffold under `src/app/(crm)/` with stub pages (no DB access).
- Feature-flag plumbing for `ENABLE_ACCOUNTING` (default off) + hiding the
  accounting nav. (Route MOVE into `(legacy)/` is deferred until Decision 1a,
  because moving 130 route files is the risky/destructive part and depends on
  whether legacy keeps the old client.)
- Provisioning/teardown scripts written but fail-fast without `DIRECT_URL`.

## What was actually built in this Sprint 1 pass (non-destructive)
- `src/styles/tokens.css` - Bitrix24 design tokens, scoped under `.kobia-crm`.
- CRM shell under `src/app/app/(crm)/` (nested under `/app` to avoid colliding
  with the `[tenant]` dynamic segment): `layout.tsx`, `CrmSidebar.tsx`
  (64/240 collapse), `CrmTopBar.tsx` (56px, switcher/search/bell/user stubs),
  `StubPage.tsx`, `crm-nav.ts`, and stub pages for Leads/Deals/Contacts/
  Companies/Activities/Automations/Reports/Settings. `/app` redirects to
  `/app/deals`. `/app(.*)` added to middleware public routes for the sprint.
- `src/lib/feature-flags.ts` - `ENABLE_ACCOUNTING` (default off).
- `scripts/provision-tenant.ts` and `scripts/destroy-tenant.ts` - written to
  FAIL FAST without `DIRECT_URL` and without `prisma/tenant/schema.prisma`. No
  `pg` dependency (uses Prisma's own driver + `prisma migrate deploy`).
- `src/lib/db/tenant-prisma.ts` - per-tenant PrismaClient bound to
  `tenant_<slug>` via `?schema=`, cached per schema.
- `src/lib/db/get-tenant-db.ts` - request-scoped `getTenantDb()` reading
  `x-tenant-id` / `x-tenant-schema` headers; throws `NoTenantError` (-> 403)
  when no tenant is attached.

## Decisions (resolved June 6 2026)
- Decision 1a: APPROVED option (A). Two Prisma clients - platform on `public`,
  tenant on `tenant_<slug>`. Legacy accounting stays on the old row-level
  default `@prisma/client` and the 2,286-line `prisma/schema.prisma` is NOT
  rewritten this sprint.
- Decision 2: APPROVED option (B). Slug-in-URL tenant resolution for Sprint 1;
  registry carries nullable `clerk_org_id` so Clerk Orgs are a later drop-in.
- Conflict 3 (DIRECT_URL): STILL PENDING. The non-pooled Neon connection string
  has not been provided. Per the constraint we do NOT invent it.

## What was completed in the Phase 3 pass (decisions applied)
- Prisma split landed. `prisma/platform/schema.prisma` (TenantRegistry, public)
  and `prisma/tenant/schema.prisma` (CRM core, no `tenantId`) each generate a
  dedicated client into `src/lib/db/generated/{platform,tenant}` (gitignored,
  regenerated by `postinstall` and `db:generate:all`). The legacy default
  `@prisma/client` is untouched, so dormant accounting code still compiles.
- `tenant-prisma.ts` and `get-tenant-db.ts` now import the generated tenant
  client (`@/lib/db/generated/tenant`) instead of the default client.
- Accounting is hidden behind `ENABLE_ACCOUNTING` (default off) WITHOUT moving
  route files: `src/app/[tenant]/layout.tsx` redirects accounting path prefixes
  to `/app/deals` when the flag is off, and `visibleModules()` filters the
  Accounting module out of `ModuleSidebar`. Flipping the flag restores both.
  (Physically relocating ~130 route files would change URLs and is the risky
  step we deliberately avoid; the flag gate is reversible and non-destructive.)
- Middleware tenant resolution wired (slug-in-URL): `src/middleware.ts` derives
  the tenant slug from the first path segment (excluding reserved segments) and
  sets `x-tenant-id` + `x-tenant-schema` (`tenant_<slug>`). No DB lookup in the
  Edge runtime; no Clerk wiring touched.
- `provision-tenant.ts` now also deploys the platform migration (creates
  `public.tenant_registry`) and upserts the registry row via the generated
  platform client.

## What remains BLOCKED (single outstanding item)
- Provisioning `acme` on Neon. Blocked ONLY on `DIRECT_URL` (Conflict 3).
  `npm run provision:tenant -- --slug acme` fails fast with clear guidance until
  the non-pooled connection string is set in `.env.local`. Everything else for
  Sprint 1 is complete and the build passes.
