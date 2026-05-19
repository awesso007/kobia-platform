import { db } from "../src/lib/db";

async function main() {
  const figTenantId = "cmpbxz2ho0000t0569w30d0j9";
  const entries = await db.journalEntry.findMany({
    where: { tenantId: figTenantId },
    include: {
      lines: { include: { account: { select: { code: true, name: true, type: true } } } },
      reversedBy: { select: { id: true, entryNumber: true } },
      reversalOf: { select: { id: true, entryNumber: true } },
    },
    orderBy: { entryNumber: "asc" },
  });

  for (const e of entries) {
    const debits = e.lines.reduce((s, l) => s + l.debitCents, 0n);
    const credits = e.lines.reduce((s, l) => s + l.creditCents, 0n);
    console.log(
      `JE #${e.entryNumber} [${e.status}] ${e.entryDate.toISOString().slice(0, 10)} — "${e.description}" — D=${debits} C=${credits} balanced=${debits === credits}`
    );
    if (e.reversedBy) console.log(`  └─ reversed by JE #${e.reversedBy.entryNumber}`);
    if (e.reversalOf) console.log(`  └─ reversal of JE #${e.reversalOf.entryNumber}`);
    for (const l of e.lines) {
      const side = l.debitCents > 0n ? `Dr ${l.debitCents}` : `Cr ${l.creditCents}`;
      console.log(`     ${l.account.code} ${l.account.name} — ${side}`);
    }
  }

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
