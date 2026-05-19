/**
 * Verify the reversal path: post a JE, reverse it, confirm balances return to prior state.
 */
import { db } from "../src/lib/db";
import { postJournalEntry, reverseJournalEntry, formatCents } from "../src/lib/accounting/ledger";

async function main() {
  const fig = await db.tenant.findUnique({ where: { slug: "fig" } });
  const entity = await db.entity.findFirst({
    where: { tenantId: fig!.id, name: "Fiscal Integrity Group" },
  });
  const cash = await db.account.findFirst({ where: { entityId: entity!.id, code: "1000" } });
  const rev = await db.account.findFirst({ where: { entityId: entity!.id, code: "4100" } });

  const cashBefore = cash!.balanceCents;
  const revBefore = rev!.balanceCents;

  console.log(`BEFORE: Cash=${formatCents(cashBefore)} | Rev=${formatCents(revBefore)}`);

  // Post a $500 entry
  const entry = await postJournalEntry({
    tenantId: fig!.id,
    entityId: entity!.id,
    entryDate: new Date(),
    description: "Reversal-test entry",
    source: "MANUAL",
    lines: [
      { accountId: cash!.id, debitCents: 50000n, creditCents: 0n },
      { accountId: rev!.id, debitCents: 0n, creditCents: 50000n },
    ],
  });
  console.log(`Posted JE #${entry.entryNumber}`);

  const afterPost = await db.account.findUnique({ where: { id: cash!.id } });
  console.log(`AFTER POST: Cash=${formatCents(afterPost!.balanceCents)}`);

  // Reverse it
  const reversal = await reverseJournalEntry(entry.id, { reason: "Reversal-test cleanup" });
  console.log(`Reversed via JE #${reversal.entryNumber}`);

  const cashFinal = await db.account.findUnique({ where: { id: cash!.id } });
  const revFinal = await db.account.findUnique({ where: { id: rev!.id } });

  console.log(`FINAL: Cash=${formatCents(cashFinal!.balanceCents)} | Rev=${formatCents(revFinal!.balanceCents)}`);

  if (cashFinal!.balanceCents === cashBefore && revFinal!.balanceCents === revBefore) {
    console.log("✅ REVERSAL VERIFIED. Balances restored exactly.");
  } else {
    console.error("❌ Balances did not restore.");
    process.exit(1);
  }

  const orig = await db.journalEntry.findUnique({ where: { id: entry.id } });
  console.log(`Original entry status: ${orig!.status} (should be REVERSED)`);
}

main().then(() => db.$disconnect()).catch(async (err) => { console.error(err); await db.$disconnect(); process.exit(1); });
