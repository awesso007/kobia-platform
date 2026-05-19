import { db } from "../src/lib/db";
async function main() {
  const entries = await db.journalEntry.findMany({
    where: { entityId: "cmpbz3vyf00024e8nndtokxvw" },
    orderBy: { entryNumber: "asc" },
    include: { lines: { select: { account: { select: { code: true, name: true } }, debitCents: true, creditCents: true } } },
  });
  for (const e of entries) {
    console.log(`JE #${e.entryNumber} | ${e.status} | ${e.entryDate.toISOString().slice(0,10)} | ${e.description}`);
    for (const l of e.lines) {
      console.log(`  ${l.account.code} ${l.account.name}  DR ${l.debitCents}  CR ${l.creditCents}`);
    }
  }
}
main().then(()=>process.exit(0));
