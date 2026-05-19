/**
 * One-time Stripe product setup.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_test_... npx tsx scripts/setup-stripe-products.ts
 *   STRIPE_SECRET_KEY=sk_live_... npx tsx scripts/setup-stripe-products.ts --live
 *
 * Creates: KOBIA Solo, KOBIA Firm, KOBIA Firm+
 * Outputs the Price IDs to paste into Vercel env vars:
 *   STRIPE_PRICE_SOLO, STRIPE_PRICE_FIRM, STRIPE_PRICE_FIRM_PLUS
 *
 * Re-running is safe: products are looked up by name first, only created if missing.
 */
import Stripe from "stripe";
import { TIERS, PAID_TIERS } from "../src/lib/tier-config";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("Missing STRIPE_SECRET_KEY env var");
  process.exit(1);
}

const stripe = new Stripe(key, { apiVersion: "2025-02-24.acacia" });

async function ensureProduct(tierKey: (typeof PAID_TIERS)[number]) {
  const tier = TIERS.find((t) => t.key === tierKey);
  if (!tier || tier.price === null || tier.price === 0) {
    throw new Error(`Tier ${tierKey} has no price`);
  }

  const productName = `KOBIA ${tier.label}`;

  // Look up existing product by name
  const existing = await stripe.products.list({ limit: 100, active: true });
  let product = existing.data.find((p) => p.name === productName);

  if (!product) {
    product = await stripe.products.create({
      name: productName,
      description: tier.tagline,
      metadata: { tierKey: tier.key },
    });
    console.log(`✓ Created product: ${productName} (${product.id})`);
  } else {
    console.log(`  Found existing product: ${productName} (${product.id})`);
  }

  // Find recurring monthly price matching this tier's amount
  const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
  const targetCents = tier.price * 100;
  let price = prices.data.find(
    (p) =>
      p.unit_amount === targetCents &&
      p.currency === "usd" &&
      p.recurring?.interval === "month",
  );

  if (!price) {
    price = await stripe.prices.create({
      product: product.id,
      unit_amount: targetCents,
      currency: "usd",
      recurring: { interval: "month" },
      metadata: { tierKey: tier.key },
    });
    console.log(`✓ Created price: $${tier.price}/mo (${price.id})`);
  } else {
    console.log(`  Found existing price: $${tier.price}/mo (${price.id})`);
  }

  return { tier: tier.key, productId: product.id, priceId: price.id };
}

async function main() {
  console.log(`Using Stripe key: ${key!.startsWith("sk_live_") ? "LIVE" : "TEST"} mode\n`);

  const results = [];
  for (const tierKey of PAID_TIERS) {
    const r = await ensureProduct(tierKey);
    results.push(r);
    console.log("");
  }

  console.log("\n=== Vercel env vars to set ===\n");
  for (const r of results) {
    console.log(`STRIPE_PRICE_${r.tier}=${r.priceId}`);
  }
  console.log("\nPaste those into Vercel → Settings → Environment Variables, then redeploy.");
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
