import { db } from "../src/lib/db";
import { formatCents } from "../src/lib/accounting/ledger";

async function main() {
  // Show all JournalLines tagged to Customer
  const lines = await db.journalLine.findMany({
    where: {
      contactRefType: "Customer",
      journalEntry: { status: { in: ["POSTED", "REVERSED"] } },
    },
    include: {
      account: { select: { code: true, name: true } },
      journalEntry: { select: { entryNumber: true, description: true } },
    },
    orderBy: { journalEntry: { entryNumber: "asc" } },
  });

  console.log(`Found ${lines.length} customer-tagged journal lines:\n`);

  const byCustomer = new Map<string, typeof lines>();
  for (const l of lines) {
    const k = l.contactRefId ?? "unknown";
    if (!byCustomer.has(k)) byCustomer.set(k, []);
    byCustomer.get(k)!.push(l);
  }

  for (const [customerId, list] of byCustomer) {
    const customer = await db.customer.findUnique({ where: { id: customerId } });
    console.log(`Customer: ${customer?.name ?? customerId}`);
    let runningAr = 0n;
    for (const l of list) {
      const side = l.debitCents > 0n ? `Dr ${formatCents(l.debitCents)}` : `Cr ${formatCents(l.creditCents)}`;
      const note = l.account.code === "1100" ? "  [AR]" : "";
      console.log(
        `  JE #${l.journalEntry.entryNumber} ${l.account.code} ${l.account.name.padEnd(28)} ${side}${note}`
      );
      if (l.account.code === "1100") runningAr += l.debitCents - l.creditCents;
    }
    console.log(`  → Net AR exposure: ${formatCents(runningAr)}\n`);
  }
  await db.$disconnect();
}
main().catch(console.error);
