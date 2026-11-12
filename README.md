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

## CHESS Corporation milestone status and external inputs (Round 24)

The CHESS-specific services are **development code on draft PR #24**, not
a production-ready KOBIA release. For all eight milestones, the current
verified implementation-versus-release matrix is in
[the CHESS CORP 2 roadmap](docs/CHESS_CORP_2_ROADMAP.md).
For **one** owner action list, including environment variable names,
protected vendor credentials, legal approvals and the priority/order to
supply them, use the
[consolidated owner-supply checklist](docs/CHESS_CORP_2_OWNER_SUPPLY_CHECKLIST.md).
Technical flags-only examples (no secrets) are in
[CHESS external environment placeholders](docs/CHESS_CORP_2_ENV_PLACEHOLDERS.example).
Never enable real bank posting, payroll execution, payments, regulated
partner workflows or consent portals from a CI pass alone.

## CHESS employee service desk — Round 27

Within the isolated CHESS tenant, sign in using an active staff
membership, open /app/overview, then select **CHESS service desk**
to navigate to /app/chess-desk. Only OWNER/ADMIN roles see the
supervisor finance, regulated, billing, reporting and security links;
every destination rechecks server permissions independently.

Business Units displays revoked client-service-grant counts after
staff offboarding. Service Billing shows the most recent draft
worker inspection, not invoice delivery. Approved financial case
reviews offer **read-only** bank/journal reconciliation.
See [Round 27 UI inventory](docs/CHESS_CORP_2_ROUND27_EMPLOYEE_UI.md)
for all M1–M8 screens, machine-only exclusions and acceptance gates.
Real Clerk/Codespaces acceptance and external approvals are still
required before any production release.

## CHESS Corporation fictional demo — Round 25 Codespaces setup

**Sandbox-only:** CHESS is an isolated fictional tenant of the independent
KOBIA platform. Stay on **feature/operations-overview**, draft PR #24.
Do not merge to main, reuse a production Neon connection, copy customer
information, activate licensed/financial integrations, or deploy production.

### Prerequisites (one-time setup)

1. On GitHub > **Code > Codespaces > New with options**, choose branch
   **feature/operations-overview** and create a fresh Codespace.
   Verify with `git branch --show-current`. The new
   `.devcontainer/devcontainer.json` configures **Node 20**, runs
   `npm ci --include=optional` **automatically** on creation,
   and forwards port **3000**. If reusing an old Codespace, **Rebuild
   Container** to apply this config; run `npm ci` manually only
   if automatic installation did not succeed.
2. In Neon, create a **separate empty sandbox database** named exactly
   `chess_demo`, and copy a **non-pooled** PostgreSQL URL at
   `*.neon.tech` with `sslmode=require`; never
   paste its password in chat or issues. In Clerk, use a **development/test**
   instance with `pk_test_`/`sk_test_` keys, and
   create a **verified primary-email** test user. Do not use a live instance.
3. Inside the Codespace terminal: `cp .env.example .env.local`
   and edit the **untracked** file. Supply these exact values:

   | .env.local variable | Sandbox-only value |
   | --- | --- |
   | `DATABASE_URL` | Empty, non-pooled Neon `chess_demo` database with TLS `sslmode=require` |
   | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk development `pk_test_...` |
   | `CLERK_SECRET_KEY` | Clerk development `sk_test_...` |
   | `CHESS_DEMO_OWNER_EMAIL` | Exact **verified primary email** of that Clerk TEST user |
   | `NODE_ENV` | `development` |
   | `CHESS_DEMO_MODE` | `true` |
   | `NEXT_PUBLIC_DEFAULT_TENANT` | `chess-demo` |
   | `NEXT_PUBLIC_ROOT_DOMAIN` | `kobia.ai` (the preview uses path-based routing) |
   | `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/chess-demo/login` (override the old `/login`) |
   | `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | `/app/overview` (override the old `/dashboard`) |
   | `NEXT_PUBLIC_APP_URL` and `CHESS_PUBLIC_ORIGIN` | **Exact forwarded HTTPS port 3000 origin** `https://<codespace>-3000.app.github.dev` for browser testing. For localhost-only testing use matching `http://localhost:3000` |

   Add the **exact** Codespaces preview origin to Clerk's development
   redirect/allowed-origins settings and confirm the port is accessible
   only to the intended test users. `DIRECT_URL` should be
   omitted (or identical to the non-pooled demo `DATABASE_URL`).
   Leave **every external feature/worker/provider approval flag** absent
   or `false`; the setup deliberately refuses any activated
   financial, licensed, AI, billing, scheduling, consent-portal or other
   outbound-service execution. The default example provides no live keys.
   If the preview origin changes, update the two app origins and Clerk
   settings, then restart Next.js.

### The one setup command

Run only **`npm run demo:setup`** after the prerequisites.
It validates the test keys, Node environment, exact Neon DB and tenant,
checks the database *before any DDL*, deploys the platform schema and the
isolated `tenant_chess_demo` migrations, registers one DEMO
tenant, and seeds **8 fictional CHESS business units, 3 staff, 5 fictional
clients, 8 CHESS work items, 4 ordinary CRM tasks and 5 PENDING
disclosures**. It does **not** grant a client service, accept consent,
create licensed credentials, transmit payroll, or post financial journals.

A second run on the same untouched fictional sandbox must not duplicate
records or upgrade existing/revoked staff access. It fails closed if fixtures
are inconsistent. For a **read-only database verification** after setup,
run `npm run demo:verify`; it should report PASS, the exact
demo tenant and fixture counts, without creating or modifying rows.

### Browser acceptance (real credentials and a real Codespace required)

4. Start the development server with `npm run dev -- -H 0.0.0.0`
   and open the **forwarded port 3000** HTTPS URL in the browser.
   Open `/chess-demo/login` and sign in using the verified
   Clerk development user matching `CHESS_DEMO_OWNER_EMAIL`.
   The first successful request to `/app/overview` may
   register *only this verified user's* new demo OWNER membership;
   a suspended or preexisting low-privilege account is **never promoted**.
5. Verify the **FICTIONAL DEMO** banner and click **Guided demo tour**
   at `/app/demo`. It must display **8 business units,
   3 fictional employees and 5 fictional profiles**, plus eight service
   cards and sample task counts. Open the work items and client directory
   via the demo links. Financial and licensed service-case queues may be
   empty by design: **PENDING consent grants no service-case access**.
6. In an unauthenticated/private browsing session, requesting
   `/app/demo` must not return client records.
   A different Clerk user not matching the allowlisted email cannot
   claim a demo OWNER membership. Verify that the service-grant
   count is **0**, all five disclosures are **PENDING**, and no bank,
   payroll, merchant, tax filing or licensed-partner operation occurred.
   Re-run `npm run demo:verify` for read-only database
   integrity after the browser tour.

**Precisely what is and is not verified:** The default GitHub Actions CI
runs actual isolated PostgreSQL platform+tenant migrations, tenant
registration, repeatable fictional seed, read-only verification, and
unrelated-schema/tenant refusal tests. CI also checks build, lint, types,
unit tests and security smoke. **CI does NOT run an actual hosted Codespace
with your Neon/Clerk test credentials or click through a real signed-in
Clerk browser.** That final acceptance requires the test resources in
[owner-supply checklist item 01](docs/CHESS_CORP_2_OWNER_SUPPLY_CHECKLIST.md).
Record the Codespace URL, date, redacted test-owner identity and screenshots
in the private staging acceptance record—never credentials or customer data.

See [Round 25 acceptance matrix](docs/CHESS_CORP_2_ROUND25_CODESPACES_ACCEPTANCE.md)
and [the earlier demo design](docs/CHESS_CORP_2_ROUND18_DEMO.md).

---

### Automated signed-in browser and accessibility acceptance (Round 28)

The browser suite is deliberately separate from normal CI because it needs a
real **Clerk development/test instance** and the isolated Neon
\`chess_demo\` database. Create three distinct verified primary-email Clerk
test users: owner, employee and client. The Playwright sign-in-token helper
does not complete MFA or additional session tasks, so the employee and client
test users must not require either.

Set these optional values in untracked \`.env.local\` **before**
\`npm run demo:setup\`:

- \`CHESS_DEMO_EMPLOYEE_EMAIL\`: the verified employee test user's primary email.
  The first successful employee visit to \`/app/overview\` may create only a
  new MEMBER membership and one SUPPORT assignment in the fictional
  Bookkeeping unit. Existing roles, suspended memberships and revoked
  assignments are never promoted or restored.
- \`CHESS_DEMO_CLIENT_EMAIL\`: the verified client test user's primary email.
  The first fictional client profile is mapped to this email during demo
  seeding. \`/chess-demo/client\` is a read-only view of that client's own
  PENDING fictional disclosure. It has no accept/withdraw controls and does
  not activate the separately gated client consent portal.

Install the pinned browser-only tools on demand (they are not KOBIA runtime
dependencies), install Chromium, then run the suite:

\`\`\`bash
npm install --no-save --package-lock=false --ignore-scripts \\
  @playwright/test@1.65.0 @clerk/testing@1.14.11 @axe-core/playwright@4.14.0
npx playwright install chromium
npm run test:e2e
\`\`\`

The suite uses Clerk's Playwright testing token and server-side sign-in helper.
It checks employee overview/service-desk/work-item access, client-only profile
and pending-disclosure visibility, cross-role denial, and axe-core WCAG 2.1 A/AA
automated scans for serious/critical violations. Automated scans do not replace
manual keyboard, screen-reader, responsive, independent accessibility or
security acceptance.

For GitHub Actions, configure the protected \`chess-demo-e2e\` environment with
the three secrets \`DATABASE_URL\` (non-pooled Neon \`chess_demo\`),
\`CLERK_PUBLISHABLE_KEY\` (\`pk_test_\`) and \`CLERK_SECRET_KEY\` (\`sk_test_\`),
plus the three email variables \`CHESS_DEMO_OWNER_EMAIL\`,
\`CHESS_DEMO_EMPLOYEE_EMAIL\` and \`CHESS_DEMO_CLIENT_EMAIL\`. Manually run
\`.github/workflows/chess-demo-browser-e2e.yml\` from
\`feature/operations-overview\` and confirm the isolated-demo checkbox. The
workflow revalidates the database and keys, runs the one-command demo setup,
verifies the fixtures, starts a local development server and runs the browser
suite. It never merges or deploys. Keep all financial, consent, calendar,
licensed-provider, AI and outbound-service switches OFF.

## Getting Started

### Option A — Legacy KOBIA development on main (NOT the CHESS demo)

1. Go to [github.com/awesso007/kobia-platform](https://github.com/awesso007/kobia-platform)
2. Click the green **"Code"** button → **"Codespaces"** tab → **"Create codespace on main"**
   **Do not use these legacy steps for the CHESS demo. Use Round 19 above.**
3. Wait ~2 minutes for the environment to spin up
4. In the Codespace terminal, run:
   ```bash
   cp .env.example .env.local
   npm install
   # Only for a disposable local DB; never run db:push on production.
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
