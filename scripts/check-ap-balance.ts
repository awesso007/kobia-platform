import { db } from "../src/lib/db";

async function main() {
  const FIG_ENTITY_ID = "cmpbz3vyf00024e8nndtokxvw";
  const ap = await db.account.findFirst({
    where: { entityId: FIG_ENTITY_ID, code: "2000" },
  });
  console.log(`AP account cached balance: ${ap?.balanceCents}`);

  // Sum journal entry line activity tagged to AP account
  const lines = await db.journalLine.findMany({
    where: { accountId: ap!.id },
    include: {
      journalEntry: {
        select: { entryNumber: true, status: true, memo: true, entryDate: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  console.log(`\nJE lines on AP account (${lines.length} total):`);
  let runDebit = 0n,
    runCredit = 0n;
  for (const l of lines) {
    runDebit += l.debitCents;
    runCredit += l.creditCents;
    console.log(
      `  JE#${l.journalEntry.entryNumber} [${l.journalEntry.status}] Dr=${l.debitCents} Cr=${l.creditCents}  memo="${l.journalEntry.memo?.slice(0, 50) ?? ""}"`
    );
  }
  console.log(
    `\nTotal Dr=${runDebit}, Cr=${runCredit}, LIABILITY balance (Cr-Dr) = ${runCredit - runDebit}`
  );

  // Also check bills
  const bills = await db.bill.findMany({
    where: { entityId: FIG_ENTITY_ID },
    select: {
      billNumber: true,
      status: true,
      totalCents: true,
      paidCents: true,
      balanceCents: true,
      vendor: { select: { name: true } },
    },
    orderBy: { billNumber: "asc" },
  });
  console.log(`\nAll bills:`);
  for (const b of bills) {
    console.log(
      `  #${b.billNumber} ${b.vendor.name} ${b.status} total=${b.totalCents} paid=${b.paidCents} bal=${b.balanceCents}`
    );
  }
  await db.$disconnect();
}
main();
