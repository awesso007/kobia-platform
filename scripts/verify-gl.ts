/**
 * Verify the General Ledger drill-down math for FIG's 1000 Cash account.
 * Expected (per session summary):
 *   Opening: $0 (before YTD)
 *   JE #1 Opening balances: +$25,000 DR
 *   JE #2 Consulting revenue: +$2,500 DR
 *   JE #3 Test entry (REVERSED): +$500 DR
 *   JE #4 Reversal of #3 (POSTED): -$500 (i.e. $500 CR)
 *   Closing: $27,500 DR
 */
import { db } from "../src/lib/db";
import { formatCents, normalBalanceSign } from "../src/lib/accounting/ledger";

async function main() {
  const acc = await db.account.findFirst({
    where: { code: "1000", entity: { name: "Fiscal Integrity Group" } },
  });
  if (!acc) throw new Error("Cash account not found");
  console.log(`Account: ${acc.code} ${acc.name} (${acc.type})`);
  console.log(`Cached balance: ${formatCents(acc.balanceCents)}`);

  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const sign = BigInt(normalBalanceSign(acc.type));

  const priorAgg = await db.journalLine.aggregate({
    where: {
      accountId: acc.id,
      journalEntry: { status: { in: ["POSTED", "REVERSED"] }, entryDate: { lt: yearStart } },
    },
    _sum: { debitCents: true, creditCents: true },
  });
  const opening = ((priorAgg._sum.debitCents ?? 0n) - (priorAgg._sum.creditCents ?? 0n)) * sign;
  console.log(`Opening (YTD start): ${formatCents(opening)}`);

  const lines = await db.journalLine.findMany({
    where: {
      accountId: acc.id,
      journalEntry: { status: { in: ["POSTED", "REVERSED"] }, entryDate: { gte: yearStart } },
    },
    include: { journalEntry: { select: { entryNumber: true, status: true, description: true } } },
    orderBy: [{ journalEntry: { entryDate: "asc" } }, { journalEntry: { entryNumber: "asc" } }],
  });

  let running = opening;
  console.log("\n  Date          JE#  Status     DR              CR              Running");
  console.log("  " + "-".repeat(78));
  for (const l of lines) {
    const delta = (l.debitCents - l.creditCents) * sign;
    running += delta;
    const dr = l.debitCents > 0n ? formatCents(l.debitCents) : "";
    const cr = l.creditCents > 0n ? formatCents(l.creditCents) : "";
    console.log(
      `  ${l.journalEntry.entryNumber.toString().padStart(3)} ${l.journalEntry.status.padEnd(10)} ` +
      `${dr.padStart(14)}  ${cr.padStart(14)}  ${formatCents(running).padStart(12)}  ${l.journalEntry.description}`
    );
  }

  console.log(`\nClosing: ${formatCents(running)}`);
  console.log(`Match cached: ${running === acc.balanceCents ? "✓" : "✗ diff " + formatCents(running - acc.balanceCents)}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
