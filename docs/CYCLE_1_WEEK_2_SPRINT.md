# Cycle 1, Week 2 Sprint — May 19-25, 2026

**Week 1 status:** ✅ Shipped (repo, CI, live deploy, multi-tenant routing, Clerk auth, Neon DB).
**Week 2 goal:** KOBIA can charge tenants. Stripe billing for KOBIA's own subscriptions is live in test mode.

---

## Why Stripe billing in Week 2 (not later)

Per MVP plan Cycle 1: "Stripe billing for KOBIA's own subscriptions." This is KOBIA charging accountant firms — NOT KOBIA's clients charging their customers (that's Cycle 3).

Doing it now means:
- Subscription tier enforcement (`FREE` vs `SOLO` vs `FIRM`) is real, not theoretical
- Webhook plumbing is in place before you need it
- You can let beta firms self-onboard with a credit card from Cycle 2 onward
- Trial → paid conversion logic is battle-tested 6 months before launch

---

## Day-by-day plan (assumes ~3-4 KOBIA hours/day)

### Tuesday May 19 (2 hrs) — Stripe account + product catalog
1. Sign up at https://stripe.com → use email `afribnetwork@gmail.com`
2. Choose **Test mode** (toggle top-right). Skip "activate live mode" — that needs a real business entity which is the LLC step later this cycle.
3. **Products → Add product** for each tier:
   - `KOBIA Solo Accountant` — $149/mo recurring
   - `KOBIA Firm` — $399/mo recurring
   - `KOBIA Firm Plus` — $899/mo recurring
   - Skip Enterprise (manual quote per Lock SSS)
4. Copy each Price ID (`price_xxx`) into `.env.local`.
5. Get API keys from **Developers → API Keys**:
   - `STRIPE_PUBLISHABLE_KEY` (pk_test_...)
   - `STRIPE_SECRET_KEY` (sk_test_...)
6. Add all keys to Vercel via the CLI commands in Section 5 below.

### Wednesday May 20 (3 hrs) — Stripe SDK + checkout route
Code I'll scaffold tonight (see below). You just need to:
1. `npm install stripe @stripe/stripe-js`
2. Wire the Price IDs into `src/lib/stripe.ts`
3. Test the `/api/checkout` endpoint locally with `npm run dev`

### Thursday May 21 (3 hrs) — Webhook handler
Stripe webhook → updates `Tenant.tier` in DB when subscription state changes.
1. Local test with Stripe CLI: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
2. Deploy and add webhook endpoint in Stripe dashboard → copy `STRIPE_WEBHOOK_SECRET` to Vercel
3. Test with Stripe's "Send test webhook" feature

### Friday May 22 (2 hrs) — Customer portal + cancel flow
- Stripe Customer Portal for self-service (change card, cancel, view invoices) — Stripe hosts it
- Add "Manage Billing" button to `/dashboard/settings/billing`

### Saturday May 23 (2 hrs) — Trial logic + tier enforcement
- 14-day trial on signup (per Lock JJJ pricing)
- Middleware checks `Tenant.tier` and `Tenant.trialEndsAt` → blocks gated features
- Friendly upgrade modal instead of hard block

### Sunday May 24 — REST DAY
Per your cron's burnout check rule. Touch nothing.

### Monday May 25 (2 hrs) — End-of-week polish
- Empty-state UI for "no subscription yet"
- Stripe error handling (card declined, etc.)
- Push, redeploy, mark Week 2 shipped in velocity log

---

## Definition of Done (Week 2)

- [ ] `demo` tenant can click "Upgrade to Solo" → Stripe Checkout → return → tier updates to `SOLO`
- [ ] Webhook updates `Tenant.tier` on subscription created / canceled / payment failed
- [ ] Customer Portal works from `/dashboard/settings/billing`
- [ ] Trial countdown shows in header
- [ ] Vercel production deploy green
- [ ] CI green
- [ ] All code committed and pushed

---

## What's already scaffolded tonight (so Tuesday is fast)

I'm adding tonight (see next commit):
- `src/lib/stripe.ts` — Stripe client + price ID map
- `src/server/routers/billing.ts` — tRPC router for checkout/portal
- `src/app/api/webhooks/stripe/route.ts` — webhook handler skeleton
- `src/app/[tenant]/settings/billing/page.tsx` — billing UI shell
- `prisma/schema.prisma` — add `Subscription` model + `Tenant.stripeCustomerId`

You'll just plug in real Price IDs and keys.

---

## Stripe env vars to set later this week

```bash
# Add to Vercel after Stripe signup:
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_SOLO=price_...
STRIPE_PRICE_FIRM=price_...
STRIPE_PRICE_FIRM_PLUS=price_...
```

Use the same pattern as the existing env vars (commands in HANDOFF.md Section 5).

---

## Risk for Week 2

**Single biggest risk:** Stripe needs business verification to leave test mode. You need an LLC.
**Mitigation:** Stay in test mode all of Cycle 1. Form Wyoming LLC via Stripe Atlas ($500) in Week 4 — doesn't block code.

**Second risk:** Webhook signing secret leaks the same way the others did tonight.
**Mitigation:** Never paste it in chat. I'll show you how to read it directly from Stripe CLI and pipe into Vercel without me ever seeing it.
