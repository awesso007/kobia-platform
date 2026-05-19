/**
 * Seed AP for FIG tenant (Fiscal Integrity Group entity).
 * Creates 3 vendors, posts 4 bills on different dates to fill aging buckets,
 * partially pays one, fully pays another, and prints the AP aging snapshot.
 *
 * Idempotent-ish: skips creation if the vendor name already exists.
 */
import { db } from "../src/lib/db";
import {
  postBill,
  recordBillPayment,
  apAgeBucket,
  findApAccount,
} from "../src/lib/accounting/ap";
import { formatCents } from "../src/lib/accounting/ledger";

const FIG_TENANT_ID = "cmpbxz2ho0000t0569w30d0j9";
const FIG_ENTITY_ID = "cmpbz3vyf00024e8nndtokxvw"; // Fiscal Integrity Group (Professional Services)

async function ensureVendor(
  name: string,
  email: string,
  terms: number,
  opts: { is1099Vendor?: boolean; taxId?: string } = {}
) {
  const existing = await db.vendor.findFirst({
    where: { entityId: FIG_ENTITY_ID, name },
  });
  if (existing) {
    console.log(`Vendor "${name}" already exists: ${existing.id}`);
    return existing;
  }
  const v = await db.vendor.create({
    data: {
      tenantId: FIG_TENANT_ID,
      entityId: FIG_ENTITY_ID,
      name,
      email,
      defaultTermsDays: terms,
      is1099Vendor: opts.is1099Vendor ?? false,
      taxId: opts.taxId,
    },
  });
  console.log(`Created vendor "${name}": ${v.id}`);
  return v;
}

async function createAndPost(args: {
  vendorId: string;
  billDate: Date;
  expenseAccountId: string;
  description: string;
  amountCents: bigint;
  vendorBillNumber?: string;
}) {
  const vendor = await db.vendor.findUnique({ where: { id: args.vendorId } });
  if (!vendor) throw new Error("vendor missing");
  const dueDate = new Date(
    args.billDate.getTime() + vendor.defaultTermsDays * 86400_000
  );

  const draft = await db.bill.create({
    data: {
      tenantId: FIG_TENANT_ID,
      entityId: FIG_ENTITY_ID,
      vendorId: args.vendorId,
      vendorBillNumber: args.vendorBillNumber,
      billNumber: 0,
      billDate: args.billDate,
      dueDate,
      status: "DRAFT",
      lines: {
        create: [
          {
            tenantId: FIG_TENANT_ID,
            accountId: args.expenseAccountId,
            description: args.description,
            quantityMilli: 1000n,
            unitPriceCents: args.amountCents,
            amountCents: args.amountCents,
            lineNumber: 1,
          },
        ],
      },
    },
  });

  const posted = await postBill(draft.id);
  console.log(
    `Posted Bill #${posted.billNumber} ${vendor.name.padEnd(30)} ${formatCents(posted.totalCents)} due ${dueDate.toISOString().slice(0, 10)}`
  );
  return posted;
}

async function main() {
  const ap = await findApAccount(FIG_ENTITY_ID);
  const cash = await db.account.findFirst({
    where: { entityId: FIG_ENTITY_ID, code: "1000" },
  });
  const rent = await db.account.findFirst({
    where: { entityId: FIG_ENTITY_ID, code: "6300" },
  });
  const software = await db.account.findFirst({
    where: { entityId: FIG_ENTITY_ID, code: "6600" },
  });
  const profFees = await db.account.findFirst({
    where: { entityId: FIG_ENTITY_ID, code: "6800" },
  });
  const utilities = await db.account.findFirst({
    where: { entityId: FIG_ENTITY_ID, code: "6400" },
  });
  if (!cash || !rent || !software || !profFees || !utilities) {
    throw new Error("Missing one of required expense/cash accounts on FIG entity.");
  }

  console.log(`AP account:       ${ap.code} ${ap.name} (${ap.id})`);
  console.log(`Cash account:     ${cash.code} ${cash.name} (${cash.id})`);
  console.log(`Rent expense:     ${rent.code} ${rent.name}`);
  console.log(`Software expense: ${software.code} ${software.name}`);
  console.log(`Prof fees:        ${profFees.code} ${profFees.name}`);
  console.log(`Utilities:        ${utilities.code} ${utilities.name}\n`);

  // Vendors
  const landlord = await ensureVendor(
    "Murrieta Office Park LLC",
    "ar@murrietaoffice.example",
    15
  );
  const adobe = await ensureVendor(
    "Adobe Inc.",
    "billing@adobe.example",
    30
  );
  const cpaConsultant = await ensureVendor(
    "Jane Patel CPA",
    "jane@patelcpa.example",
    30,
    { is1099Vendor: true, taxId: "XX-XXX1234" }
  );

  console.log("\n--- Posting bills ---");
  const now = new Date();

  // Bill 1: monthly rent, dated today, Net 15 → CURRENT
  await createAndPost({
    vendorId: landlord.id,
    billDate: now,
    expenseAccountId: rent.id,
    description: "May 2026 office rent",
    amountCents: 320000n, // $3,200
    vendorBillNumber: "MAY-2026",
  });

  // Bill 2: Adobe Creative Cloud, dated 10 days ago, Net 30 → CURRENT
  await createAndPost({
    vendorId: adobe.id,
    billDate: new Date(now.getTime() - 10 * 86400_000),
    expenseAccountId: software.id,
    description: "Creative Cloud team — May",
    amountCents: 23999n, // $239.99
    vendorBillNumber: "AD-44231",
  });

  // Bill 3: CPA consult, dated 45 days ago, Net 30 → DAYS_1_30 (15d past due)
  await createAndPost({
    vendorId: cpaConsultant.id,
    billDate: new Date(now.getTime() - 45 * 86400_000),
    expenseAccountId: profFees.id,
    description: "Q1 tax advisory hours",
    amountCents: 145000n, // $1,450
    vendorBillNumber: "PCP-2026-014",
  });

  // Bill 4: Old utility bill, dated 80 days ago, Net 15 → DAYS_61_90 (65d past due)
  // Use software vendor for variety, but expense to utilities — actually use rent landlord again to keep vendor distinct? Use Adobe (multi-bill same vendor).
  await createAndPost({
    vendorId: adobe.id,
    billDate: new Date(now.getTime() - 80 * 86400_000),
    expenseAccountId: software.id,
    description: "Enterprise license — Feb",
    amountCents: 89900n, // $899
    vendorBillNumber: "AD-39001",
  });

  // Partial payment on Bill 3 ($500 of $1,450)
  const cpaBill = await db.bill.findFirst({
    where: { vendorId: cpaConsultant.id, totalCents: 145000n, status: "OPEN" },
  });
  if (cpaBill) {
    await recordBillPayment({
      billId: cpaBill.id,
      paymentDate: now,
      amountCents: 50000n,
      cashAccountId: cash.id,
      method: "ach",
      reference: "ACH-051826",
    });
    console.log(`\nApplied $500 partial payment to Bill #${cpaBill.billNumber} (Jane Patel CPA)`);
  }

  // Full payment on Bill 1 (rent — paid promptly)
  const rentBill = await db.bill.findFirst({
    where: { vendorId: landlord.id, totalCents: 320000n, status: "OPEN" },
  });
  if (rentBill) {
    await recordBillPayment({
      billId: rentBill.id,
      paymentDate: now,
      amountCents: 320000n,
      cashAccountId: cash.id,
      method: "check",
      reference: "Check #1042",
    });
    console.log(`Fully paid Bill #${rentBill.billNumber} (Murrieta Office Park rent) via check`);
  }

  console.log("\n--- AP Aging snapshot ---");
  const openBills = await db.bill.findMany({
    where: { entityId: FIG_ENTITY_ID, status: { in: ["OPEN", "PARTIAL"] } },
    include: { vendor: true },
    orderBy: { dueDate: "asc" },
  });

  console.log(`As of ${now.toISOString().slice(0, 10)} — ${openBills.length} open bill(s)\n`);
  for (const b of openBills) {
    const bucket = apAgeBucket(b.dueDate, now);
    const daysPastDue = Math.max(
      0,
      Math.floor((now.getTime() - b.dueDate.getTime()) / 86400_000)
    );
    console.log(
      `Bill #${b.billNumber} ${b.vendor.name.padEnd(28)} due ${b.dueDate.toISOString().slice(0, 10)} ` +
        `(${daysPastDue}d) [${bucket}] balance=${formatCents(b.balanceCents)} (of ${formatCents(b.totalCents)})`
    );
  }

  // Sanity check: AP balance should equal sum of open balances
  const apAccount = await db.account.findUnique({ where: { id: ap.id } });
  const sumBalances = openBills.reduce((s, b) => s + b.balanceCents, 0n);
  console.log(`\nAP cached balance: ${formatCents(apAccount!.balanceCents)}`);
  console.log(`Sum of open bill balances: ${formatCents(sumBalances)}`);
  console.log(`Match? ${apAccount!.balanceCents === sumBalances ? "✓" : "✗ MISMATCH"}`);

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
