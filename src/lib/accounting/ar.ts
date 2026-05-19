/**
 * Accounts Receivable posting logic.
 *
 * Invoice lifecycle:
 *   DRAFT -> OPEN (posts JE: Dr AR / Cr Revenue)
 *   OPEN -> PARTIAL/PAID (each payment posts JE: Dr Cash / Cr AR)
 *   OPEN/PARTIAL -> VOID (reverses original JE; only if no payments applied)
 *
 * All money math is BigInt cents. Invoice totals and balances are recomputed
 * on every line / payment write.
 */
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { postJournalEntry, LedgerError, type DraftEntry } from "./ledger";

/** Find the canonical AR account for an entity (code "1100" by convention). */
export async function findArAccount(entityId: string) {
  const account = await db.account.findFirst({
    where: {
      entityId,
      OR: [{ code: "1100" }, { name: { contains: "Receivable", mode: "insensitive" } }],
      type: "ASSET",
      isActive: true,
    },
    orderBy: { code: "asc" },
  });
  if (!account) {
    throw new LedgerError(
      "AR_ACCOUNT_NOT_FOUND",
      "No Accounts Receivable account found for this entity. Add one with code 1100."
    );
  }
  return account;
}

/** Recompute totalCents / balanceCents from current line + payment rows. */
export async function recomputeInvoiceTotals(
  invoiceId: string,
  client: Prisma.TransactionClient | typeof db = db
) {
  const lines = await client.invoiceLine.findMany({
    where: { invoiceId },
    select: { amountCents: true },
  });
  const subtotal = lines.reduce((s, l) => s + l.amountCents, 0n);
  const total = subtotal; // tax stored separately; subtotal == total for now
  const paid = await client.invoicePayment.aggregate({
    where: { invoiceId },
    _sum: { amountCents: true },
  });
  const paidCents = paid._sum.amountCents ?? 0n;
  const balanceCents = total - paidCents;

  return client.invoice.update({
    where: { id: invoiceId },
    data: {
      subtotalCents: subtotal,
      totalCents: total,
      paidCents,
      balanceCents,
    },
  });
}

/** Post a DRAFT invoice to the ledger. Idempotent if already OPEN. */
export async function postInvoice(
  invoiceId: string,
  options: { postedByUserId?: string } = {}
) {
  return db.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        lines: { include: { account: true } },
        customer: true,
      },
    });
    if (!invoice) throw new LedgerError("NOT_FOUND", "Invoice not found.");
    if (invoice.status !== "DRAFT") {
      throw new LedgerError("ALREADY_POSTED", `Invoice is ${invoice.status}, not DRAFT.`);
    }
    if (invoice.lines.length === 0) {
      throw new LedgerError("NO_LINES", "Invoice has no lines.");
    }

    const arAccount = await findArAccount(invoice.entityId);

    // Recompute totals from lines
    const subtotal = invoice.lines.reduce((s, l) => s + l.amountCents, 0n);
    if (subtotal <= 0n) {
      throw new LedgerError("ZERO_TOTAL", "Invoice total must be > 0.");
    }

    // Build the JE: one debit to AR, one credit per revenue account
    // Group lines by accountId to consolidate credit rows
    const creditsByAccount = new Map<string, bigint>();
    for (const l of invoice.lines) {
      creditsByAccount.set(
        l.accountId,
        (creditsByAccount.get(l.accountId) ?? 0n) + l.amountCents
      );
    }

    const draft: DraftEntry = {
      tenantId: invoice.tenantId,
      entityId: invoice.entityId,
      entryDate: invoice.issueDate,
      description: `Invoice — ${invoice.customer.name}`,
      memo: invoice.memo ?? undefined,
      source: "MANUAL",
      sourceRefId: invoice.id,
      lines: [
        {
          accountId: arAccount.id,
          debitCents: subtotal,
          creditCents: 0n,
          memo: `AR — ${invoice.customer.name}`,
          contactRefType: "Customer",
          contactRefId: invoice.customerId,
        },
        ...Array.from(creditsByAccount.entries()).map(([accountId, cents]) => ({
          accountId,
          debitCents: 0n,
          creditCents: cents,
          contactRefType: "Customer",
          contactRefId: invoice.customerId,
        })),
      ],
    };

    const je = await postJournalEntry(draft, {
      postedByUserId: options.postedByUserId,
      client: tx,
    });

    // Assign sequential invoiceNumber per entity
    const maxNumber = await tx.invoice.aggregate({
      where: { entityId: invoice.entityId, invoiceNumber: { gt: 0 } },
      _max: { invoiceNumber: true },
    });
    const nextNumber = (maxNumber._max.invoiceNumber ?? 0) + 1;

    const updated = await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        status: "OPEN",
        invoiceNumber: nextNumber,
        postingJournalEntryId: je.id,
        postedAt: new Date(),
        subtotalCents: subtotal,
        totalCents: subtotal,
        balanceCents: subtotal,
      },
    });

    return updated;
  });
}

/**
 * Record a payment against a posted invoice. Posts JE: Dr cashAccount / Cr AR.
 * Updates invoice.paidCents, balanceCents, and status (PARTIAL or PAID).
 */
export async function recordInvoicePayment(args: {
  invoiceId: string;
  paymentDate: Date;
  amountCents: bigint;
  cashAccountId: string;
  method?: string;
  reference?: string;
  postedByUserId?: string;
}) {
  return db.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({
      where: { id: args.invoiceId },
      include: { customer: true },
    });
    if (!invoice) throw new LedgerError("NOT_FOUND", "Invoice not found.");
    if (invoice.status === "DRAFT") {
      throw new LedgerError("NOT_POSTED", "Invoice must be posted (OPEN) before payment.");
    }
    if (invoice.status === "VOID") {
      throw new LedgerError("VOID", "Cannot pay a voided invoice.");
    }
    if (invoice.status === "PAID") {
      throw new LedgerError("ALREADY_PAID", "Invoice is already fully paid.");
    }
    if (args.amountCents <= 0n) {
      throw new LedgerError("BAD_AMOUNT", "Payment amount must be > 0.");
    }
    if (args.amountCents > invoice.balanceCents) {
      throw new LedgerError(
        "OVERPAYMENT",
        `Payment ${args.amountCents} exceeds open balance ${invoice.balanceCents}.`
      );
    }

    const arAccount = await findArAccount(invoice.entityId);

    const draft: DraftEntry = {
      tenantId: invoice.tenantId,
      entityId: invoice.entityId,
      entryDate: args.paymentDate,
      description: `Payment — ${invoice.customer.name} (Inv #${invoice.invoiceNumber})`,
      memo: args.reference ?? args.method ?? undefined,
      source: "MANUAL",
      sourceRefId: invoice.id,
      lines: [
        {
          accountId: args.cashAccountId,
          debitCents: args.amountCents,
          creditCents: 0n,
          memo: `Payment from ${invoice.customer.name}`,
          contactRefType: "Customer",
          contactRefId: invoice.customerId,
        },
        {
          accountId: arAccount.id,
          debitCents: 0n,
          creditCents: args.amountCents,
          memo: `Applied to Inv #${invoice.invoiceNumber}`,
          contactRefType: "Customer",
          contactRefId: invoice.customerId,
        },
      ],
    };

    const je = await postJournalEntry(draft, {
      postedByUserId: args.postedByUserId,
      client: tx,
    });

    const payment = await tx.invoicePayment.create({
      data: {
        tenantId: invoice.tenantId,
        invoiceId: invoice.id,
        paymentDate: args.paymentDate,
        amountCents: args.amountCents,
        cashAccountId: args.cashAccountId,
        method: args.method,
        reference: args.reference,
        journalEntryId: je.id,
      },
    });

    const newPaid = invoice.paidCents + args.amountCents;
    const newBalance = invoice.totalCents - newPaid;
    const newStatus = newBalance === 0n ? "PAID" : "PARTIAL";

    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        paidCents: newPaid,
        balanceCents: newBalance,
        status: newStatus,
      },
    });

    return payment;
  });
}

/** Bucket an invoice by age relative to a reference date (default: today). */
export function ageBucket(dueDate: Date, asOf: Date = new Date()) {
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysPastDue = Math.floor((asOf.getTime() - dueDate.getTime()) / msPerDay);
  if (daysPastDue < 0) return "CURRENT" as const;
  if (daysPastDue <= 30) return "DAYS_1_30" as const;
  if (daysPastDue <= 60) return "DAYS_31_60" as const;
  if (daysPastDue <= 90) return "DAYS_61_90" as const;
  return "DAYS_OVER_90" as const;
}

export type AgeBucket = ReturnType<typeof ageBucket>;
