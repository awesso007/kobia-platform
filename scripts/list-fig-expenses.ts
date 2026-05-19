import { db } from "../src/lib/db";

async function main() {
  const FIG_ENTITY_ID = "cmpbz3vyf00024e8nndtokxvw";
  const expenses = await db.account.findMany({
    where: { entityId: FIG_ENTITY_ID, type: "EXPENSE" },
    select: { code: true, name: true, id: true },
    orderBy: { code: "asc" },
  });
  console.log("FIG Expense accounts:");
  expenses.forEach((e) => console.log(`  ${e.code} ${e.name} (${e.id})`));

  const ap = await db.account.findFirst({
    where: { entityId: FIG_ENTITY_ID, code: "2000" },
  });
  console.log(`\nAP account: ${ap?.code} ${ap?.name} (${ap?.id})`);

  await db.$disconnect();
}
main();
