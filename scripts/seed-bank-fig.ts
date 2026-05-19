/**
 * Seed bank reconciliation data for FIG tenant.
 *
 * Creates:
 *   - "Chase Business Checking" BankAccount linked to FIG's GL Cash account (code 1000)
 *   - A sample CSV statement with 8 transactions:
 *       4 that should auto-match to existing AR/AP JEs already posted
 *       4 that should fall through to categorize/rules:
 *         - Adobe outflow $89.99 (rule should auto-categorize → Software & Subscriptions 6600)
 *         - Adobe outflow $899.00 (same rule)
 *         - Stripe payout inflow $1,200 (no rule; will require manual categorize)
 *         - ATM withdrawal outflow $300 (no rule)
 *   - 1 BankRule: "Adobe → Software & Subscriptions"
 *
 * Idempotent: if the BankAccount already exists, this script wipes its txns + rules and re-imports.
 */
import { db } from "../src/lib/db";
import { importCsvRows, parseBankCsv, applyRulesToUnmatched } from "../src/lib/accounting/bank-rec";
import { formatCents } from "../src/lib/accounting/ledger";

const FIG_TENANT_ID = "cmpbxz2ho0000t0569w30d0j9";
const FIG_ENTITY_ID = "cmpbz3vyf00024e8nndtokxvw";

// Existing AR/AP payment JEs in FIG were all posted on 2026-05-19 by prior seed scripts.
// We center the CSV around that date so the match engine (±5-day window) finds the candidates.
const SAMPLE_CSV = `Date,Description,Amount
2026-05-17,ACME PROPERTIES PAYMENT,800.00
2026-05-17,ADOBE INC SUBSCRIPTION,-89.99
2026-05-18,MURRIETA OFFICE PARK RENT CHECK 1042,-3200.00
2026-05-19,STRIPE PAYOUT REF 8821,1200.00
2026-05-20,ADOBE INC ANNUAL PLAN,-899.00
2026-05-20,JANE PATEL CPA ACH PAYMENT,-500.00
2026-05-21,ATM WITHDRAWAL,-300.00
2026-05-22,BAY CITY HOLDINGS WIRE,4500.00`;

async function main() {
  console.log("→ Seeding bank reconciliation data for FIG\n");

  // Bank-rec lib accepts an optional userId; for seeding we leave it undefined.
  const userId: string | undefined = undefined;

  // 1. Find GL Cash account
  const cashAccount = await db.account.findFirst({
    where: { tenantId: FIG_TENANT_ID, entityId: FIG_ENTITY_ID, code: "1000" },
  });
  if (!cashAccount) throw new Error("FIG Cash account (1000) not found.");
  console.log(
    `Cash account: ${cashAccount.code} ${cashAccount.name} — balance ${formatCents(cashAccount.balanceCents)}`
  );

  // 2. Find Software & Subscriptions account (6600)
  const softwareAccount = await db.account.findFirst({
    where: { tenantId: FIG_TENANT_ID, entityId: FIG_ENTITY_ID, code: "6600" },
  });
  if (!softwareAccount) throw new Error("FIG Software & Subscriptions (6600) not found.");

  // 3. Get or create the BankAccount
  let bank = await db.bankAccount.findFirst({
    where: { tenantId: FIG_TENANT_ID, glAccountId: cashAccount.id },
  });
  if (bank) {
    console.log(`\nBankAccount already exists: ${bank.id} (${bank.name})`);
    console.log("Wiping existing transactions and rules for clean re-seed...");
    await db.bankTransaction.deleteMany({ where: { bankAccountId: bank.id } });
    await db.bankRule.deleteMany({ where: { bankAccountId: bank.id } });
    await db.reconciliationSession.deleteMany({ where: { bankAccountId: bank.id } });
  } else {
    bank = await db.bankAccount.create({
      data: {
        tenantId: FIG_TENANT_ID,
        entityId: FIG_ENTITY_ID,
        glAccountId: cashAccount.id,
        name: "Chase Business Checking ····4521",
        institution: "Chase",
        accountLast4: "4521",
        accountType: "CHECKING",
        openingBalanceCents: 0n,
      },
    });
    console.log(`\nCreated BankAccount: ${bank.id} (${bank.name})`);
  }

  // 4. Create the Adobe rule BEFORE importing — so it auto-applies on import
  const rule = await db.bankRule.create({
    data: {
      tenantId: FIG_TENANT_ID,
      bankAccountId: bank.id,
      name: "Adobe → Software & Subscriptions",
      descriptionContains: "ADOBE",
      offsetAccountId: softwareAccount.id,
      appliesToInflow: false,
      appliesToOutflow: true,
      memoTemplate: "Adobe subscription (auto)",
      priority: 100,
    },
  });
  console.log(
    `Created rule: "${rule.name}" → ${softwareAccount.code} ${softwareAccount.name}`
  );

  // 5. Parse and import the sample CSV
  console.log("\nImporting sample CSV...");
  const rows = parseBankCsv(SAMPLE_CSV);
  console.log(`Parsed ${rows.length} rows.`);

  const importResult = await importCsvRows({
    tenantId: FIG_TENANT_ID,
    bankAccountId: bank.id,
    rows,
  });
  console.log(
    `Imported ${importResult.imported} new (skipped ${importResult.skipped} duplicates).`
  );

  // 6. Apply rules
  const ruleResult = await applyRulesToUnmatched({
    tenantId: FIG_TENANT_ID,
    bankAccountId: bank.id,
    userId,
  });
  console.log(`Auto-categorized ${ruleResult.categorized} transactions via rules.`);

  // 7. Print final txn breakdown
  console.log("\n=== Bank transactions after seed ===");
  const all = await db.bankTransaction.findMany({
    where: { bankAccountId: bank.id },
    orderBy: { postedDate: "asc" },
  });
  for (const t of all) {
    const sign = t.amountCents > 0n ? "+" : "";
    console.log(
      `  [${t.status.padEnd(12)}] ${t.postedDate.toISOString().slice(0, 10)}  ${sign}${formatCents(t.amountCents).padStart(12)}  ${t.description}`
    );
  }

  // 8. Status summary
  const byStatus = await db.bankTransaction.groupBy({
    by: ["status"],
    where: { bankAccountId: bank.id },
    _count: { _all: true },
  });
  console.log("\n=== Status summary ===");
  for (const s of byStatus) {
    console.log(`  ${s.status.padEnd(12)}: ${s._count._all}`);
  }

  console.log(`\n✓ Bank rec seed complete. Visit /fig/bank/${bank.id} to test.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n✗ Seed failed:", err);
    process.exit(1);
  });
