# KOBIA.AI Platform

> Multi-tenant SaaS platform. Phase 1: AI-native accounting for accountants and the businesses they serve.
> **Launches Feb 15, 2027.**

[![CI](https://github.com/awesso007/kobia-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/awesso007/kobia-platform/actions/workflows/ci.yml)
[![License: Proprietary](https://img.shields.io/badge/License-Proprietary-red.svg)](#license)

---

## What is KOBIA

KOBIA is a multi-tenant SaaS platform that gives accountants, business owners, and the clients they serve a complete operating system to run their books, payroll, invoicing, and bill pay — with an AI layer that catches errors, reconciles transactions, and answers questions in natural language.

**Phase 1 wedge:** AI-native accounting that beats QuickBooks Online, Xero, Karbon, Bill.com, and Gusto on time-to-close, accuracy, and onboarding speed.

**Phase 2 (Year 2):** Tax preparation.
**Phase 3 (Year 3+):** Mortgage origination and real estate management.

---

## Tech Stack (locked)

| Layer | Choice | Why |
|---|---|---|
| Framework | [Next.js 14+](https://nextjs.org/) (App Router) | Server Components, edge runtime, best DX for SaaS |
| Language | TypeScript (strict) | End-to-end type safety |
| API | [tRPC](https://trpc.io/) | Zero-boilerplate typesafe APIs |
| ORM | [Prisma](https://www.prisma.io/) | Type-safe DB access, migrations |
| Database | [Neon Postgres](https://neon.tech/) | Serverless, branchable, scales free → enterprise |
| Auth | [Clerk](https://clerk.com/) | Multi-tenant ready, per-tenant subdomain login |
| Styling | [Tailwind CSS](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/) | Fast, accessible, customizable |
| Email | [Resend](https://resend.com/) | Modern transactional email API |
| Hosting | [Vercel](https://vercel.com/) | Native Next.js deploy, edge functions |
| Monitoring | [Sentry](https://sentry.io/) + [PostHog](https://posthog.com/) | Errors + product analytics |

---

## Multi-Tenant Architecture (Lock EEEE)

Each KOBIA tenant gets:

- **Their own subdomain:** `{tenant}.kobia.ai` (e.g., `figaccounting.kobia.ai`)
- **Separate employee login URL:** `{tenant}.kobia.ai/login`
- **Separate client portal URL:** `{tenant}.kobia.ai/portal`
- **Tenant-branded UI** — their logo, colors, fonts. KOBIA branding is invisible on all paid tiers above entry level.
- **Row-level data isolation** — every database table has a `tenantId` column, enforced at the ORM layer.

---

## CHESS Corporation fictional demo (Round 18, feature branch only)

**Never merge this feature branch or point it at the production database.**
The production Vercel site continues to use main. This setup is for your own
GitHub Codespace on feature/operations-overview, a **separate Neon database
named exactly chess_demo**, and a **Clerk test instance**. No customer data,
money, payroll, tax returns, e-signatures, license verification, or regulated
transactions are seeded or sent anywhere.

1. Open GitHub > **Code > Codespaces > ... > New with options**, select
   branch **feature/operations-overview**, then create the Codespace.
   Verify by running **git branch --show-current** before using any database keys.
2. In [Neon](https://neon.tech), create an independent sandbox database
   named **chess_demo**. Copy its **non-pooled** PostgreSQL connection string,
   including sslmode=require. **Do not use the production Neon URL.**
   In [Clerk](https://clerk.com), create/use a development/test instance,
   copy both test API keys and create one verified test user whose email
   you control. Configure the Codespaces preview origin in Clerk's development
   application's allowed/redirect origins as required.
3. In the terminal, run **npm ci**, then **cp .env.example .env.local**.
   Edit only the local untracked **.env.local**. Paste these three keys/connection
   values plus your verified test-user email:

   | Setting | Value |
   |---|---|
   | DATABASE_URL | Neon non-pooled PostgreSQL connection string to chess_demo with sslmode=require |
   | NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY | Clerk test publishable key (pk_test_...) |
   | CLERK_SECRET_KEY | Clerk test secret key (sk_test_...) |
   | CHESS_DEMO_OWNER_EMAIL | Verified email of the Clerk test user (not a secret key) |
   | NODE_ENV | development |
   | CHESS_DEMO_MODE | true |
   | NEXT_PUBLIC_DEFAULT_TENANT | chess-demo |
   | NEXT_PUBLIC_ROOT_DOMAIN | kobia.ai |
   | NEXT_PUBLIC_APP_URL | http://localhost:3000 |

   **Do not paste credentials into GitHub issues, pull requests, or ChatGPT.**
   No DIRECT_URL, Stripe, banking, tax, mortgage, calendar, AI or payment
   keys are required for the limited demo. The setup command uses the
   non-pooled DATABASE_URL as the migration connection.
4. Run **npm run demo:setup** once. It runs the platform migrations,
   creates only the tenant_chess_demo schema, deploys tenant migrations into
   that schema, and idempotently seeds 8 invented business units, 3 invented
   employees, 5 invented clients and example work items.
5. Run **npm run dev -- -H 0.0.0.0**. Forward port **3000** and open the
   Codespaces preview URL. Browse to **/chess-demo/login** and sign in as
   the verified Clerk test user matching CHESS_DEMO_OWNER_EMAIL.
   The first visit to **/app/overview** attaches that authenticated test
   identity as OWNER only for the fictional demo tenant.
6. Use the CHESS Corporation - FICTIONAL DEMO links on /app/overview to explore
   business units, staff, client profiles, tasks, finance and regulatory
   coordination, and reports. Client-service grants are intentionally absent;
   the demo does NOT enable cross-business sensitive records or externally
   executing actions.

**Safety checks:** npm run demo:setup refuses NODE_ENV=production, live Clerk
credentials, pooled Neon URLs, any database name other than chess_demo,
missing test-owner allowlist and mismatched default tenant. Setting
CHESS_DEMO_MODE=true does not bypass the independent service release gates.

See [Round 18 demo acceptance](docs/CHESS_CORP_2_ROUND18_DEMO.md).

---

## Getting Started

### Option A — GitHub Codespaces (recommended for Wilfred, no laptop setup)

1. Go to [github.com/awesso007/kobia-platform](https://github.com/awesso007/kobia-platform)
2. Click the green **"Code"** button → **"Codespaces"** tab → **"Create codespace on main"**
3. Wait ~2 minutes for the environment to spin up
4. In the Codespace terminal, run:
   ```bash
   cp .env.example .env.local
   npm install
   npm run db:push
   npm run dev
   ```
5. Open the forwarded port URL (Codespaces will show a popup). You'll see KOBIA running.

### Option B — Local development

Requirements: Node.js 20+, npm, git, Postgres (or use Neon connection string)

```bash
git clone https://github.com/awesso007/kobia-platform.git
cd kobia-platform
cp .env.example .env.local
# Edit .env.local with your secrets
npm install
npm run db:push
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Environment Variables

Copy `.env.example` to `.env.local` and fill in:

| Variable | Where to get it | Required? |
|---|---|---|
| `DATABASE_URL` | [neon.tech](https://neon.tech/) → create project → copy connection string | Yes |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | [clerk.com](https://clerk.com/) → API keys | Yes |
| `CLERK_SECRET_KEY` | [clerk.com](https://clerk.com/) → API keys | Yes |
| `RESEND_API_KEY` | [resend.com](https://resend.com/) → API keys | Optional (Cycle 2) |
| `SENTRY_DSN` | [sentry.io](https://sentry.io/) → project settings | Optional (Cycle 3) |

---

## Project Structure

```
kobia-platform/
├── prisma/
│   └── schema.prisma           # Multi-tenant DB schema
├── src/
│   ├── app/
│   │   ├── [tenant]/           # Per-tenant routes (Lock EEEE)
│   │   │   ├── login/          # Tenant-branded login
│   │   │   ├── dashboard/      # Role-aware home (Lock HHH)
│   │   │   ├── books/          # Bookkeeping module shell
│   │   │   ├── payroll/        # Payroll module shell
│   │   │   ├── invoicing/      # AR/invoicing shell
│   │   │   ├── bills/          # AP/bill pay shell
│   │   │   └── settings/       # Tenant settings (branding, users)
│   │   └── api/trpc/[trpc]/    # tRPC API handler
│   ├── server/
│   │   ├── trpc.ts             # tRPC setup with tenant context
│   │   └── routers/            # API routers per module
│   ├── lib/
│   │   ├── db.ts               # Prisma client
│   │   ├── auth.ts             # Clerk integration
│   │   └── tenant.ts           # Tenant resolution from subdomain
│   └── components/
│       ├── ui/                 # shadcn/ui components
│       ├── branding/           # PoweredByKobia (Lock EEEE)
│       └── layout/             # Sidebar, header, nav
├── .github/workflows/
│   └── ci.yml                  # Lint + typecheck + test on push
└── docs/
    ├── ARCHITECTURE.md
    ├── CYCLE_1_SCOPE.md
    └── LOCKS_REFERENCE.md
```

---

## Cycles

- **Cycle 1 (Weeks 1-6, May-Jun 2026):** Foundation — this scaffold
- **Cycle 2 (Weeks 7-12, Jul-Aug 2026):** Core books + FIG as first internal tenant
- **Cycle 3 (Weeks 13-18, Sep-Oct 2026):** Payroll multi-state
- **Cycle 4 (Weeks 19-24, Nov-Dec 2026):** Invoicing + AP
- **Cycle 5 (Weeks 25-30, Jan 2027):** AI layer + QBO migration
- **Cycle 6 (Weeks 31-36, Feb 2027):** Launch hardening — public Feb 15, 2027

See `docs/CYCLE_1_SCOPE.md` for current cycle.

---

## License

Proprietary. © 2026 KOBIA.AI. All rights reserved. Not open source.

---

## Founder Notes

Maintained by Wilfred ([@awesso007](https://github.com/awesso007)) with AI agent assistance.
Roadmap: 226 locked decisions across 83 named Locks (A through FFFF), v5.2.3.
