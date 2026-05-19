/**
 * Seed AR for FIG tenant (Fiscal Integrity Group entity).
 * Creates 2 customers, posts 3 invoices on different dates to fill aging buckets,
 * partially pays one, and prints the aging report.
 *
 * Idempotent-ish: skips creation if the customer name already exists.
 */
import { db } from "../src/lib/db";
import { postInvoice, recordInvoicePayment, ageBucket, findArAccount } from "../src/lib/accounting/ar";
import { formatCents } from "../src/lib/accounting/ledger";

const FIG_TENANT_ID = "cmpbxz2ho0000t0569w30d0j9";
const FIG_ENTITY_ID = "cmpbz3vyf00024e8nndtokxvw"; // Fiscal Integrity Group (Professional Services)

async function ensureCustomer(name: string, email: string, terms: number) {
  const existing = await db.customer.findFirst({
    where: { entityId: FIG_ENTITY_ID, name },
  });
  if (existing) {
    console.log(`Customer "${name}" already exists: ${existing.id}`);
    return existing;
  }
  const c = await db.customer.create({
    data: {
      tenantId: FIG_TENANT_ID,
      entityId: FIG_ENTITY_ID,
      name,
      email,
      defaultTermsDays: terms,
    },
  });
  console.log(`Created customer "${name}": ${c.id}`);
  return c;
}

async function createAndPost(args: {
  customerId: string;
  issueDate: Date;
  revenueAccountId: string;
  description: string;
  amountCents: bigint;
}) {
  // Use customer terms for due date
  const customer = await db.customer.findUnique({ where: { id: args.customerId } });
  if (!customer) throw new Error("customer missing");
  const dueDate = new Date(args.issueDate.getTime() + customer.defaultTermsDays * 86400_000);

  const draft = await db.invoice.create({
    data: {
      tenantId: FIG_TENANT_ID,
      entityId: FIG_ENTITY_ID,
      customerId: args.customerId,
      invoiceNumber: 0,
      issueDate: args.issueDate,
      dueDate,
      status: "DRAFT",
      lines: {
        create: [
          {
            tenantId: FIG_TENANT_ID,
            accountId: args.revenueAccountId,
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

  const posted = await postInvoice(draft.id);
  console.log(`Posted Inv #${posted.invoiceNumber} for ${formatCents(posted.totalCents)}, due ${dueDate.toISOString().slice(0, 10)}`);
  return posted;
}

async function main() {
  // Look up required accounts
  const ar = await findArAccount(FIG_ENTITY_ID);
  const cash = await db.account.findFirst({
    where: { entityId: FIG_ENTITY_ID, code: "1000" },
  });
  const revenue = await db.account.findFirst({
    where: { entityId: FIG_ENTITY_ID, code: "4100" },
  });
  if (!cash || !revenue) throw new Error("Missing cash (1000) or revenue (4100) account on FIG entity.");

  console.log(`AR account: ${ar.code} ${ar.name} (${ar.id})`);
  console.log(`Cash account: ${cash.code} ${cash.name} (${cash.id})`);
  console.log(`Revenue account: ${revenue.code} ${revenue.name} (${revenue.id})\n`);

  // Customers
  const acme = await ensureCustomer("Acme Properties LLC", "ap@acme.example", 30);
  const bayCity = await ensureCustomer("Bay City Holdings", "billing@baycity.example", 15);

  console.log("\n--- Posting invoices ---");
  const now = new Date();

  // Invoice 1: dated today, Net 30 → CURRENT bucket
  await createAndPost({
    customerId: acme.id,
    issueDate: now,
    revenueAccountId: revenue.id,
    description: "May consulting retainer",
    amountCents: 350000n, // $3,500
  });

  // Invoice 2: issued 45 days ago, Net 30 → 15 days past due → DAYS_1_30
  await createAndPost({
    customerId: acme.id,
    issueDate: new Date(now.getTime() - 45 * 86400_000),
    revenueAccountId: revenue.id,
    description: "April bookkeeping",
    amountCents: 180000n, // $1,800
  });

  // Invoice 3: issued 90 days ago, Net 15 → 75 days past due → DAYS_61_90
  await createAndPost({
    customerId: bayCity.id,
    issueDate: new Date(now.getTime() - 90 * 86400_000),
    revenueAccountId: revenue.id,
    description: "Q1 tax prep advance",
    amountCents: 250000n, // $2,500
  });

  // Partial payment on Invoice 2 ($800 of $1,800)
  const inv2 = await db.invoice.findFirst({
    where: { customerId: acme.id, totalCents: 180000n, status: "OPEN" },
  });
  if (inv2) {
    await recordInvoicePayment({
      invoiceId: inv2.id,
      paymentDate: now,
      amountCents: 80000n,
      cashAccountId: cash.id,
      method: "ach",
      reference: "Stripe payout 5/18",
    });
    console.log(`\nApplied $800 payment to Inv #${inv2.invoiceNumber}`);
  }

  console.log("\n--- AR Aging snapshot ---");
  const openInvoices = await db.invoice.findMany({
    where: { entityId: FIG_ENTITY_ID, status: { in: ["OPEN", "PARTIAL"] } },
    include: { customer: true },
    orderBy: { dueDate: "asc" },
  });

  console.log(`As of ${now.toISOString().slice(0, 10)} — ${openInvoices.length} open invoice(s)\n`);
  for (const inv of openInvoices) {
    const bucket = ageBucket(inv.dueDate, now);
    const daysPastDue = Math.max(
      0,
      Math.floor((now.getTime() - inv.dueDate.getTime()) / 86400_000)
    );
    console.log(
      `Inv #${inv.invoiceNumber} ${inv.customer.name.padEnd(22)} due ${inv.dueDate.toISOString().slice(0, 10)} ` +
        `(${daysPastDue}d) [${bucket}] balance=${formatCents(inv.balanceCents)} (of ${formatCents(inv.totalCents)})`
    );
  }

  // Sanity check: AR account balance should equal sum of open balances
  const arAccount = await db.account.findUnique({ where: { id: ar.id } });
  const sumBalances = openInvoices.reduce((s, i) => s + i.balanceCents, 0n);
  console.log(`\nAR cached balance: ${formatCents(arAccount!.balanceCents)}`);
  console.log(`Sum of open invoice balances: ${formatCents(sumBalances)}`);
  console.log(`Match? ${arAccount!.balanceCents === sumBalances ? "✓" : "✗ MISMATCH"}`);

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
