/**
 * One-shot verification: pull live FIG books and compute P&L + Balance Sheet
 * directly from the DB, then print to stdout. Sanity check before deploying.
 */
import { db } from "../src/lib/db";
import { formatCents, normalBalanceSign } from "../src/lib/accounting/ledger";

async function main() {
  const tenant = await db.tenant.findFirst({ where: { slug: "fig" } });
  if (!tenant) throw new Error("FIG tenant not found");
  const entity = await db.entity.findFirst({ where: { tenantId: tenant.id } });
  if (!entity) throw new Error("FIG entity not found");

  console.log(`Entity: ${entity.name} (${entity.id})`);
  console.log(`Tenant: ${tenant.name} (${tenant.id})`);
  console.log();

  // P&L (year-to-date)
  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const accounts = await db.account.findMany({
    where: {
      entityId: entity.id,
      tenantId: tenant.id,
      type: { in: ["REVENUE", "OTHER_INCOME", "EXPENSE", "COGS", "OTHER_EXPENSE"] },
    },
    include: {
      journalLines: {
        where: { journalEntry: { status: { in: ["POSTED", "REVERSED"] }, entryDate: { gte: yearStart } } },
        select: { debitCents: true, creditCents: true },
      },
    },
  });

  let totalRevenue = 0n;
  let totalExp = 0n;
  console.log("=== Profit & Loss (YTD) ===");
  for (const acc of accounts) {
    const sign = BigInt(normalBalanceSign(acc.type));
    let net = 0n;
    for (const l of acc.journalLines) net += l.debitCents - l.creditCents;
    const amount = sign === 1n ? net : -net;
    if (amount === 0n) continue;
    console.log(`  ${acc.code} ${acc.name} (${acc.type}): ${formatCents(amount)}`);
    if (acc.type === "REVENUE" || acc.type === "OTHER_INCOME") totalRevenue += amount;
    else totalExp += amount;
  }
  const netIncome = totalRevenue - totalExp;
  console.log(`  Total Revenue: ${formatCents(totalRevenue)}`);
  console.log(`  Total Expenses: ${formatCents(totalExp)}`);
  console.log(`  Net Income: ${formatCents(netIncome)}`);
  console.log();

  // Balance Sheet
  const allAccounts = await db.account.findMany({
    where: { entityId: entity.id, tenantId: tenant.id },
    orderBy: { code: "asc" },
  });
  let totalAssets = 0n;
  let totalLiab = 0n;
  let totalEq = 0n;
  let retained = 0n;
  console.log("=== Balance Sheet ===");
  for (const a of allAccounts) {
    if (a.balanceCents === 0n) continue;
    console.log(`  ${a.code} ${a.name} (${a.type}): ${formatCents(a.balanceCents)}`);
    if (a.type === "ASSET") totalAssets += a.balanceCents;
    else if (a.type === "LIABILITY") totalLiab += a.balanceCents;
    else if (a.type === "EQUITY") totalEq += a.balanceCents;
    else if (a.type === "REVENUE" || a.type === "OTHER_INCOME") retained += a.balanceCents;
    else retained -= a.balanceCents;
  }
  const totalEquity = totalEq + retained;
  console.log(`  Total Assets: ${formatCents(totalAssets)}`);
  console.log(`  Total Liabilities: ${formatCents(totalLiab)}`);
  console.log(`  Booked Equity: ${formatCents(totalEq)}`);
  console.log(`  Retained Earnings: ${formatCents(retained)}`);
  console.log(`  Total Equity: ${formatCents(totalEquity)}`);
  console.log(`  L + E: ${formatCents(totalLiab + totalEquity)}`);
  console.log(`  Balanced: ${totalAssets === totalLiab + totalEquity ? "✓ YES" : "✗ NO"}`);
  console.log(`  Diff: ${formatCents(totalAssets - (totalLiab + totalEquity))}`);

  // Cross-check: Net Income should equal Retained Earnings (FIG has no prior years)
  console.log();
  console.log("=== Cross-check ===");
  console.log(`  Net Income (YTD): ${formatCents(netIncome)}`);
  console.log(`  Retained Earnings: ${formatCents(retained)}`);
  console.log(`  Match: ${netIncome === retained ? "✓ YES" : "✗ NO"}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
