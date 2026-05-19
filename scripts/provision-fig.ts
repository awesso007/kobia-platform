/**
 * Provisions FIG's accounting books on KOBIA.
 *
 * This is the first real exercise of the ledger engine against production data.
 * FIG = Fiscal Integrity Group — Wilfred's accounting/mortgage/real estate firm.
 * Tier = INTERNAL (free forever per Lock SSS, no KOBIA branding per Lock EEEE).
 *
 * Runs:
 *  - Provision an Entity named "Fiscal Integrity Group" with industry PROFESSIONAL_SERVICES
 *  - Seed chart of accounts (~36 accounts after industry merge)
 *  - Post an opening-balance journal entry
 *  - Verify: trial balance = 0, total debits = total credits
 *
 * Idempotent: if the entity already exists, exits cleanly.
 */
import { db } from "../src/lib/db";
import { provisionEntity } from "../src/lib/accounting/provision-entity";
import { formatCents } from "../src/lib/accounting/ledger";

async function main() {
  const fig = await db.tenant.findUnique({ where: { slug: "fig" } });
  if (!fig) {
    console.error("FIG tenant not found. Run prisma seed first.");
    process.exit(1);
  }

  const existing = await db.entity.findFirst({
    where: { tenantId: fig.id, name: "Fiscal Integrity Group" },
  });
  if (existing) {
    console.log(`Entity already exists: ${existing.id}`);
    await reportTrialBalance(existing.id);
    return;
  }

  console.log("Provisioning FIG entity with PROFESSIONAL_SERVICES chart...");

  const entity = await provisionEntity({
    tenantId: fig.id,
    name: "Fiscal Integrity Group",
    legalName: "Fiscal Integrity Group LLC",
    industry: "PROFESSIONAL_SERVICES",
    fiscalYearEnd: "12-31",
    baseCurrency: "USD",
    openingBalances: [
      // Realistic FIG opening balances (placeholders Wilfred can adjust later)
      // Total debits must equal total credits.
      { accountCode: "1000", debitCents: 2500000n }, // Cash $25,000
      { accountCode: "1100", debitCents: 750000n },  // AR $7,500
      { accountCode: "1500", debitCents: 1500000n }, // PP&E $15,000
      { accountCode: "2000", creditCents: 250000n }, // AP ($2,500)
      { accountCode: "2700", creditCents: 1000000n },// Long-term debt ($10,000)
      { accountCode: "3000", creditCents: 3500000n },// Owner's equity ($35,000)
    ],
  });

  console.log(`✓ Entity created: ${entity.id}`);
  await reportTrialBalance(entity.id);
}

async function reportTrialBalance(entityId: string) {
  const accounts = await db.account.findMany({
    where: { entityId },
    orderBy: { code: "asc" },
  });

  console.log(`\n📊 TRIAL BALANCE — ${accounts.length} accounts`);
  console.log("─".repeat(72));
  console.log("Code   Account                                       Balance");
  console.log("─".repeat(72));

  let totalDebit = 0n;
  let totalCredit = 0n;

  for (const a of accounts) {
    if (a.balanceCents === 0n) continue;
    // For display: ASSET/EXPENSE positive = debit, LIABILITY/EQUITY/REVENUE positive = credit
    const isDebitNormal = ["ASSET", "EXPENSE", "COGS", "OTHER_EXPENSE"].includes(a.type);
    const balance = a.balanceCents;
    const debitAmt = isDebitNormal ? (balance > 0n ? balance : 0n) : (balance < 0n ? -balance : 0n);
    const creditAmt = isDebitNormal ? (balance < 0n ? -balance : 0n) : (balance > 0n ? balance : 0n);
    totalDebit += debitAmt;
    totalCredit += creditAmt;
    const side = debitAmt > 0n ? `DR ${formatCents(debitAmt)}` : `CR ${formatCents(creditAmt)}`;
    console.log(`${a.code.padEnd(6)} ${a.name.padEnd(45)} ${side}`);
  }

  console.log("─".repeat(72));
  console.log(`TOTAL DEBITS:  ${formatCents(totalDebit)}`);
  console.log(`TOTAL CREDITS: ${formatCents(totalCredit)}`);
  console.log(`DIFFERENCE:    ${formatCents(totalDebit - totalCredit)}`);

  if (totalDebit === totalCredit) {
    console.log("\n✅ BOOKS BALANCE. Double-entry verified.");
  } else {
    console.error("\n❌ BOOKS DO NOT BALANCE. Bug somewhere.");
    process.exit(1);
  }

  // Journal entries
  const entries = await db.journalEntry.findMany({
    where: { entityId },
    orderBy: { entryNumber: "asc" },
    include: { lines: true },
  });
  console.log(`\n📒 JOURNAL ENTRIES: ${entries.length}`);
  for (const e of entries) {
    console.log(`  JE #${e.entryNumber} — ${e.description} (${e.source}, ${e.status}, ${e.lines.length} lines)`);
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await db.$disconnect();
    process.exit(1);
  });
