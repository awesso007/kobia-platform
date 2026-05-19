# KOBIA Architecture

## Multi-tenancy model (Lock EEEE)

KOBIA uses **shared database, shared schema, tenant-scoped rows**:

- One Postgres database
- Every business table includes a `tenantId` column
- All queries filter by `tenantId` via the Prisma client + tRPC middleware
- Row-level security policies enforced at the DB layer (added in Cycle 3)

## Subdomain routing

Production:

```
fig.kobia.ai            → /[tenant]/...    (tenant=fig)
fig.kobia.ai/login      → /fig/login       (tenant employees)
fig.kobia.ai/portal     → /fig/portal      (tenant clients — Cycle 4)
```

Development (path-based for simplicity):

```
localhost:3000/fig/login
localhost:3000/fig/dashboard
```

## Auth model

- **Identity provider:** Clerk
- **User table** mirrors Clerk identities (synced via webhook)
- **Membership table** joins User × Tenant with a Role
- **One user can belong to many tenants** — useful for accountants who manage multiple firms

## Roles (Lock HHH role-aware UI)

| Role | Access |
|---|---|
| OWNER | Full control + billing |
| ADMIN | Full operational control |
| ACCOUNTANT | All accounting modules |
| STAFF | Limited operational access |
| CLIENT | Only their own data (client portal) |
| VIEWER | Read-only |

## Branding override (Lock EEEE)

- Free + Entry tier: "Powered by KOBIA" footer shown
- Solo/Firm/Firm+/Enterprise/Internal: KOBIA branding hidden by default
- Master admin can force show/hide per tenant via override flag

## API layer

- **tRPC** for typesafe RPC between Next.js client and server
- All procedures live under `src/server/routers/`
- `protectedProcedure` enforces auth + injects tenant context

## Future considerations

- Cycle 3: Add Postgres RLS (row-level security) as a defense-in-depth layer
- Cycle 5: Add vector embeddings table for AI features (pgvector extension)
- Year 2: Consider Citus/sharded Postgres if a single tenant exceeds 50M rows
