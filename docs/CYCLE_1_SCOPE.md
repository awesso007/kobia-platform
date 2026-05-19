# Cycle 1 Scope (Weeks 1-6, May-Jun 2026)

**Goal:** Deployable foundation. No accounting features yet. Just the multi-tenant skeleton.

## Definition of Done

### Repo + Infra
- [x] Private GitHub repo (`awesso007/kobia-platform`)
- [x] Next.js 14 + TypeScript + tRPC + Prisma + Tailwind stack
- [x] CI pipeline (lint + typecheck + build + test)
- [ ] Vercel deployment connected to main branch
- [ ] Neon Postgres database provisioned
- [ ] Clerk account + dev keys configured
- [ ] Custom domain (kobia.ai or final brand choice) connected

### Multi-tenant foundation
- [x] Tenant table with branding fields (Lock EEEE)
- [x] User, Membership, Role enum
- [x] Tenant resolution from subdomain
- [x] Tenant-branded login page
- [x] Tenant-branded dashboard
- [x] PoweredByKobia component with tier-based hiding

### Module shells
- [x] /books (Bookkeeping shell)
- [x] /payroll
- [x] /invoicing
- [x] /bills
- [x] /settings

### Auth
- [x] Clerk integration
- [x] User sync from Clerk to DB
- [ ] Invite flow (admin invites user to tenant)
- [ ] Role-based UI gating

### Observability
- [ ] Sentry error reporting
- [ ] PostHog product analytics
- [ ] Audit log writes from every mutation

### Internal use
- [ ] FIG tenant seeded and accessible at fig.kobia.ai
- [ ] Demo tenant seeded for marketing
- [ ] Wilfred can log in and click through every page

## Out of scope (deferred to later cycles)

- ❌ Any accounting logic (Cycle 2)
- ❌ Payroll (Cycle 3)
- ❌ Invoicing/AP (Cycle 4)
- ❌ AI features (Cycle 5)
- ❌ QBO migration tool (Cycle 5)
- ❌ Client portal (Cycle 4)
- ❌ Stripe billing (Cycle 5)

## Risk register

| Risk | Mitigation |
|---|---|
| Clerk pricing scales with tenants | Negotiate at month 3 or move to self-hosted Supabase Auth |
| Vercel function timeouts on long jobs | Move to Vercel Cron + dedicated worker (Inngest/Trigger.dev) in Cycle 5 |
| Single Postgres instance bottleneck | Plan Citus sharding strategy by Year 2 |
| Solo founder burnout | Friday velocity log + burnout check (already automated) |
