import { db } from "../src/lib/db";
import { formatCents } from "../src/lib/accounting/ledger";

async function main() {
  const ar = await db.account.findFirst({ where: { entityId: "cmpbz3vyf00024e8nndtokxvw", code: "1100" } });
  if (!ar) throw new Error("no AR");

  // Sum signed AR JournalLine activity from POSTED and REVERSED entries
  const lines = await db.journalLine.findMany({
    where: {
      accountId: ar.id,
      journalEntry: { status: { in: ["POSTED", "REVERSED"] } },
    },
    include: { journalEntry: { select: { entryNumber: true, status: true, description: true } } },
    orderBy: { journalEntry: { entryNumber: "asc" } },
  });

  let running = 0n;
  for (const l of lines) {
    const net = l.debitCents - l.creditCents; // AR is a debit-normal asset
    running += net;
    console.log(
      `JE #${l.journalEntry.entryNumber} [${l.journalEntry.status}] Dr=${l.debitCents} Cr=${l.creditCents} running=${formatCents(running)} — ${l.journalEntry.description}`
    );
  }
  console.log(`\nComputed AR balance: ${formatCents(running)}`);
  console.log(`Cached AR balance:    ${formatCents(ar.balanceCents)}`);
  console.log(`Match: ${running === ar.balanceCents ? "✓" : "✗"}`);
  await db.$disconnect();
}
main().catch(console.error);
