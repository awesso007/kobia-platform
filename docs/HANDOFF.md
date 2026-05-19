# KOBIA Platform — Cycle 1 Hand-Off

**Last updated:** May 18, 2026, 6:30 PM PDT
**Status:** ✅ Live in production
**Live URL:** https://kobia-platform.vercel.app

---

## 1. Quick Access

| Service | URL | Login |
|---|---|---|
| **Live site** | https://kobia-platform.vercel.app | n/a (public) |
| **GitHub repo** | https://github.com/awesso007/kobia-platform | `awesso007` |
| **Vercel dashboard** | https://vercel.com/kobiaai/kobia-platform | GitHub SSO (`awesso007`) |
| **Neon console** | https://console.neon.tech | GitHub or email |
| **Clerk dashboard** | https://dashboard.clerk.com | GitHub (`awesso007`) |

---

## 2. Production Credentials

Production env vars live in **Vercel only** (https://vercel.com/kobiaai/kobia-platform/settings/environment-variables). Local copies live in `.env.local` (gitignored).

Variables set in production:
- `DATABASE_URL` — Neon Postgres connection string
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — Clerk publishable key (safe to expose)
- `CLERK_SECRET_KEY` — Clerk secret (server-only)
- `NEXT_PUBLIC_ROOT_DOMAIN` — currently `kobia-platform.vercel.app`

**Never commit real values to this file.** A local untracked copy with the real values lives at `~/.kobia-credentials.txt` on your laptop (create it from `.env.local`).

⚠️ Current credentials were pasted in chat tonight. **Rotate within 7 days** — see Section 5.

---

## 3. What's Live Right Now

- **Multi-tenant routing:** `/{tenant}/login` → `/{tenant}/dashboard` (subdomain-ready)
- **Tenants seeded:** `fig` (INTERNAL tier, KOBIA brand hidden) + `demo` (FREE tier, KOBIA brand shown)
- **Auth:** Clerk (email + Google sign-in)
- **Database:** 5 tables — Tenant, User, Membership, ApiKey, AuditLog
- **CI:** GitHub Actions runs on every push; currently green
- **Stack:** Next.js 14.2.15 + tRPC 11 + Prisma 5.22 + Tailwind + shadcn/ui

**Verify it works:**
- https://kobia-platform.vercel.app/ → homepage (200)
- https://kobia-platform.vercel.app/demo/login → Clerk sign-in
- https://kobia-platform.vercel.app/fig/login → Clerk sign-in (FIG tenant, no KOBIA branding)

---

## 4. Daily Workflow

### To make a code change
```bash
cd /home/user/workspace/kobia-platform
# edit files
npm run build         # ALWAYS build locally first (CI failures cost 10 min)
npm test
git add -A && git commit -m "your message"
git push origin main  # CI runs automatically
```

### To deploy after a code change
**Today (manual):** After push, run `vercel --token $VERCEL_TOKEN --prod` from the project folder.
**After Section 6 below:** Auto-deploys on every `git push origin main`.

### To inspect the live database
Neon console → SQL Editor → run queries against `neondb`.
Or locally: `npx prisma studio` opens a UI at `localhost:5555`.

---

## 5. Credential Rotation Playbook (do this within 7 days)

### A. Rotate Neon password
1. Open https://console.neon.tech → your project → **Roles**.
2. Click `neondb_owner` → **Reset password** → copy new password.
3. Update `DATABASE_URL` in two places:
   - **Locally:** edit `.env` and `.env.local`, replace the password segment.
   - **Vercel:** run
     ```bash
     cd /home/user/workspace/kobia-platform
     vercel --token $VERCEL_TOKEN env rm DATABASE_URL production --yes
     echo "postgresql://neondb_owner:NEW_PASSWORD@ep-spring-queen-akhelyi0-pooler.c-3.us-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require" | vercel --token $VERCEL_TOKEN env add DATABASE_URL production
     vercel --token $VERCEL_TOKEN --prod
     ```

### B. Rotate Clerk secret key
1. Open https://dashboard.clerk.com → **KOBIA Dev** → **API Keys**.
2. Click the eye icon next to `CLERK_SECRET_KEY` → **Roll secret key** → copy new value.
3. Update Vercel:
   ```bash
   vercel --token $VERCEL_TOKEN env rm CLERK_SECRET_KEY production --yes
   echo "sk_test_NEW_KEY" | vercel --token $VERCEL_TOKEN env add CLERK_SECRET_KEY production
   vercel --token $VERCEL_TOKEN --prod
   ```
4. Update local `.env.local` with the same new key.

### C. Rename Neon database `neondb` → `kobia` (optional but cleaner)
**Easiest path: do it from Neon console.**
1. Neon console → your project → **Databases**.
2. Hover `neondb` → click pencil icon → rename to `kobia`.
3. Update the `/neondb` segment in `DATABASE_URL` to `/kobia` everywhere (`.env`, `.env.local`, Vercel env vars).
4. Redeploy: `vercel --token $VERCEL_TOKEN --prod`.

**Alternative (SQL):** Cannot rename the database you're currently connected to. Create new, dump/restore, drop old. Skip unless you really want a clean name.

---

## 6. Wire Vercel ↔ GitHub Auto-Deploy (5-min manual step)

The CLI can't do this — Vercel needs OAuth to read your GitHub repos.

1. Open https://vercel.com/kobiaai/kobia-platform/settings/git
2. Click **Connect Git Repository**.
3. If prompted, install the **Vercel GitHub App** on `awesso007` account → grant access to `kobia-platform`.
4. Select `awesso007/kobia-platform` → branch `main`.
5. Done — every `git push origin main` now auto-deploys to production.

After this, your workflow is just: edit → commit → push. No more CLI deploys.

---

## 7. Custom Domain Decision (defer to weekend)

You have three real options:

| Option | Cost | Pro | Con |
|---|---|---|---|
| **kobia.ai** | ~$70-120/yr | On-brand, available, modern TLD | `.ai` more expensive long-term |
| **kobia.com** | $5K-$50K (parked) | Best brand, universal | Premium price tag |
| **getkobia.com** or **kobia.app** | ~$15/yr | Cheap, fast | Compromise on brand |
| **kobia-platform.vercel.app** | $0 | Already live | Vercel branding visible |

**Recommendation:** Grab `kobia.ai` this weekend on Namecheap or Cloudflare. It's the cleanest fit for an AI-native platform and keeps the runway open to acquire `kobia.com` later if you ever raise.

Once purchased:
1. Vercel project → **Domains** → **Add** → `kobia.ai`
2. Update DNS at registrar to Vercel's nameservers (or add A/CNAME records).
3. Update `NEXT_PUBLIC_ROOT_DOMAIN=kobia.ai` env var in Vercel.
4. Update Clerk → **Domains** → add `kobia.ai`.

---

## 8. What's Next (Cycle 1 Week 2+)

Per `/home/user/workspace/KOBIA_Accounting_MVP_Plan.md`:

- **Week 2:** Stripe billing integration (subscription tiers FREE → ENTERPRISE)
- **Week 3:** Chart of Accounts schema + UI
- **Week 4:** Plaid sandbox connection for bank feeds
- **Week 5:** AI bank reconciliation engine (the wedge feature)
- **Week 6:** Cycle 1 close — invite first 5 beta accountants

Your daily 6 AM founder briefing will track this. The weekly Friday shipped-vs-slipped review will keep you honest.

---

## 9. Emergency Contacts

- **Lost access to GitHub:** GitHub account recovery → `awesso007` → afribnetwork@gmail.com
- **Lost access to Vercel:** Vercel uses GitHub SSO → recover GitHub first
- **Lost access to Neon:** Email reset to afribnetwork@gmail.com
- **Lost access to Clerk:** GitHub SSO → recover GitHub first
- **Database corruption:** Neon keeps 7-day point-in-time restore on free tier; console → Restore.
- **Site down:** Check https://www.vercel-status.com and https://status.clerk.com first.

---

## 10. Roadmap Anchors

- **Master roadmap:** `/home/user/workspace/KOBIA_AI_Master_Strategy_Roadmap.md` (v5.2.3, 226 locks)
- **MVP plan:** `/home/user/workspace/KOBIA_Accounting_MVP_Plan.md`
- **This doc:** `/home/user/workspace/kobia-platform/docs/HANDOFF.md`
- **Architecture:** `/home/user/workspace/kobia-platform/docs/ARCHITECTURE.md`
- **Cycle 1 scope:** `/home/user/workspace/kobia-platform/docs/CYCLE_1_SCOPE.md`
- **Locks reference:** `/home/user/workspace/kobia-platform/docs/LOCKS_REFERENCE.md`

---

**Launch target:** February 15, 2027 — **273 days remaining**.
