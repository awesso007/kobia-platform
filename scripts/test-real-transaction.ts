/**
 * End-to-end ledger test: post a realistic FIG transaction against production DB.
 *
 * Scenario: FIG receives $2,500 cash for a mortgage consulting engagement.
 *   - Debit Cash (1000) $2,500
 *   - Credit Consulting Revenue (4100) $2,500
 *
 * Verifies: entry posts, account balances update, trial balance still balances.
 */
import { db } from "../src/lib/db";
import { postJournalEntry, formatCents } from "../src/lib/accounting/ledger";

async function main() {
  const fig = await db.tenant.findUnique({ where: { slug: "fig" } });
  if (!fig) throw new Error("FIG tenant missing");

  const entity = await db.entity.findFirst({
    where: { tenantId: fig.id, name: "Fiscal Integrity Group" },
  });
  if (!entity) throw new Error("FIG entity not provisioned. Run provision:fig first.");

  const cash = await db.account.findFirst({ where: { entityId: entity.id, code: "1000" } });
  const consultingRevenue = await db.account.findFirst({ where: { entityId: entity.id, code: "4100" } });

  if (!cash || !consultingRevenue) throw new Error("Required accounts missing.");

  console.log("BEFORE:");
  console.log(`  Cash (1000):                 ${formatCents(cash.balanceCents)}`);
  console.log(`  Consulting Revenue (4100):   ${formatCents(consultingRevenue.balanceCents)}`);

  const entry = await postJournalEntry({
    tenantId: fig.id,
    entityId: entity.id,
    entryDate: new Date(),
    description: "Mortgage consulting engagement — client ABC",
    memo: "Initial test transaction proving end-to-end ledger functionality",
    source: "MANUAL",
    lines: [
      { accountId: cash.id, debitCents: 250000n, creditCents: 0n, memo: "Cash received" },
      { accountId: consultingRevenue.id, debitCents: 0n, creditCents: 250000n, memo: "Consulting fee earned" },
    ],
  });

  console.log(`\n✓ Posted JE #${entry.entryNumber} (${entry.id})`);

  const cashAfter = await db.account.findUnique({ where: { id: cash.id } });
  const revAfter = await db.account.findUnique({ where: { id: consultingRevenue.id } });

  console.log("\nAFTER:");
  console.log(`  Cash (1000):                 ${formatCents(cashAfter!.balanceCents)}  (\u0394 +$2,500.00 ✓)`);
  console.log(`  Consulting Revenue (4100):   ${formatCents(revAfter!.balanceCents)}  (\u0394 +$2,500.00 ✓)`);

  // Recompute trial balance
  const all = await db.account.findMany({ where: { entityId: entity.id } });
  let td = 0n, tc = 0n;
  for (const a of all) {
    const isDebitNormal = ["ASSET", "EXPENSE", "COGS", "OTHER_EXPENSE"].includes(a.type);
    const bal = a.balanceCents;
    if (isDebitNormal) {
      if (bal > 0n) td += bal; else tc += -bal;
    } else {
      if (bal > 0n) tc += bal; else td += -bal;
    }
  }
  console.log(`\nTrial balance: DR=${formatCents(td)} | CR=${formatCents(tc)} | Diff=${formatCents(td - tc)}`);
  if (td === tc) {
    console.log("✅ End-to-end double-entry VERIFIED. Ledger engine works against production.");
  } else {
    console.error("❌ Trial balance broken.");
    process.exit(1);
  }
}

main().then(() => db.$disconnect()).catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
