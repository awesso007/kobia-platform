/**
 * Provisions a 2nd entity under the FIG tenant to demo the multi-entity switcher.
 * "FIG Properties LLC" — a real-estate sister entity to FIG.
 * Idempotent.
 */
import { db } from "../src/lib/db";
import { provisionEntity } from "../src/lib/accounting/provision-entity";

async function main() {
  const fig = await db.tenant.findUnique({ where: { slug: "fig" } });
  if (!fig) throw new Error("FIG tenant not found");

  const name = "FIG Properties LLC";
  const existing = await db.entity.findFirst({
    where: { tenantId: fig.id, name },
  });
  if (existing) {
    console.log(`Entity already exists: ${existing.id} — ${existing.name}`);
    return;
  }

  const entity = await provisionEntity({
    tenantId: fig.id,
    name,
    legalName: name,
    industry: "REAL_ESTATE",
    fiscalYearEnd: "12-31",
    baseCurrency: "USD",
    openingBalances: [
      { accountCode: "1000", debitCents: 500000n },  // Cash $5,000
      { accountCode: "1700", debitCents: 25000000n }, // RE held for sale $250,000
      { accountCode: "2700", creditCents: 22000000n }, // Long-term debt $220,000
      { accountCode: "3000", creditCents: 3500000n },  // Owner's equity $35,000
    ],
  });

  console.log(`✓ Created entity ${entity.id}: ${entity.name} (REAL_ESTATE)`);

  // Quick verify: list all FIG entities
  const all = await db.entity.findMany({
    where: { tenantId: fig.id, isActive: true },
    orderBy: { name: "asc" },
  });
  console.log(`\nFIG now has ${all.length} entities:`);
  for (const e of all) {
    console.log(`  - ${e.name} (${e.industry ?? "general"}) — ${e.id}`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
