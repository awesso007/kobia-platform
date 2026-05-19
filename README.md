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
