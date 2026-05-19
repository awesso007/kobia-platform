import { db } from "../src/lib/db";
import { formatCents } from "../src/lib/accounting/ledger";
async function main() {
  const e = await db.entity.findFirst({ where: { name: "FIG Properties LLC" } });
  if (!e) throw new Error("not found");
  const accs = await db.account.findMany({ where: { entityId: e.id }, orderBy: { code: "asc" } });
  let dr = 0n, cr = 0n;
  for (const a of accs) {
    if (a.balanceCents === 0n) continue;
    const debitNormal = ["ASSET","EXPENSE","COGS","OTHER_EXPENSE"].includes(a.type);
    if (debitNormal) {
      if (a.balanceCents > 0n) dr += a.balanceCents;
      else cr += -a.balanceCents;
    } else {
      if (a.balanceCents > 0n) cr += a.balanceCents;
      else dr += -a.balanceCents;
    }
    console.log(`  ${a.code} ${a.name} (${a.type}): ${formatCents(a.balanceCents)}`);
  }
  console.log(`\n  Total DR: ${formatCents(dr)}`);
  console.log(`  Total CR: ${formatCents(cr)}`);
  console.log(`  Balanced: ${dr === cr ? "✓" : "✗ diff " + formatCents(dr - cr)}`);
  console.log(`  Account count: ${accs.length}`);
}
main().then(()=>process.exit(0));
