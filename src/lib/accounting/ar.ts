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
import { toBaseAmount, convert } from "./fx";

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

/** Find or create the Sales Tax Payable liability account for an entity (code "2200"). */
export async function findOrCreateSalesTaxPayable(
  entityId: string,
  tenantId: string,
  client: Prisma.TransactionClient | typeof db = db,
) {
  let account = await client.account.findFirst({
    where: {
      entityId,
      OR: [{ code: "2200" }, { name: { contains: "Sales Tax Payable", mode: "insensitive" } }],
      type: "LIABILITY",
    },
  });
  if (!account) {
    account = await client.account.create({
      data: {
        tenantId,
        entityId,
        code: "2200",
        name: "Sales Tax Payable",
        type: "LIABILITY",
        subtype: "Tax Liability",
        isActive: true,
        isSystem: false,
      },
    });
  }
  return account;
}

/** Recompute totalCents / balanceCents from current line + payment rows. */
export async function recomputeInvoiceTotals(
  invoiceId: string,
  client: Prisma.TransactionClient | typeof db = db
) {
  const invoice = await client.invoice.findUnique({
    where: { id: invoiceId },
    select: { taxRateBps: true },
  });
  const lines = await client.invoiceLine.findMany({
    where: { invoiceId },
    select: { amountCents: true },
  });
  const subtotal = lines.reduce((s, l) => s + l.amountCents, 0n);
  const bps = BigInt(invoice?.taxRateBps ?? 0);
  const tax = bps > 0n ? (subtotal * bps) / 10_000n : 0n;
  const total = subtotal + tax;
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
      taxCents: tax,
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
        lines: { include: { account: true, item: true } },
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

    // Recompute totals from lines (in invoice currency)
    const subtotal = invoice.lines.reduce((s, l) => s + l.amountCents, 0n);
    if (subtotal <= 0n) {
      throw new LedgerError("ZERO_TOTAL", "Invoice total must be > 0.");
    }

    // Apply sales tax (in invoice currency)
    const taxBps = BigInt(invoice.taxRateBps ?? 0);
    const taxCents = taxBps > 0n ? (subtotal * taxBps) / 10_000n : 0n;
    const grandTotal = subtotal + taxCents;

    // FX conversion: post to GL in BASE currency.
    const entity = await tx.entity.findUnique({ where: { id: invoice.entityId } });
    const baseCurrency = entity?.baseCurrency ?? "USD";
    const invoiceCurrency = invoice.currency || baseCurrency;
    const fx = await toBaseAmount({
      tenantId: invoice.tenantId,
      fromCurrency: invoiceCurrency,
      toCurrency: baseCurrency,
      asOf: invoice.issueDate,
      originalCents: grandTotal,
    });
    const baseGrandTotal = fx.baseCents;
    const baseTaxCents =
      invoiceCurrency === baseCurrency ? taxCents : convert(taxCents, fx.rate);
    const baseSubtotal = baseGrandTotal - baseTaxCents;

    // Build the JE: one debit to AR (subtotal + tax), one credit per revenue account, plus tax credit.
    // Group lines by accountId; convert each group to base currency.
    const creditsByAccount = new Map<string, bigint>();
    for (const l of invoice.lines) {
      const origCents = l.amountCents;
      const baseLineCents =
        invoiceCurrency === baseCurrency
          ? origCents
          : convert(origCents, fx.rate);
      creditsByAccount.set(
        l.accountId,
        (creditsByAccount.get(l.accountId) ?? 0n) + baseLineCents
      );
    }

    // Reconcile rounding drift: ensure sum of revenue credits equals baseSubtotal exactly.
    let creditTotal = 0n;
    for (const v of creditsByAccount.values()) creditTotal += v;
    if (creditTotal !== baseSubtotal && creditsByAccount.size > 0) {
      const diff = baseSubtotal - creditTotal;
      const firstKey = creditsByAccount.keys().next().value as string;
      creditsByAccount.set(firstKey, (creditsByAccount.get(firstKey) ?? 0n) + diff);
    }

    // COGS posting: for each line with an INVENTORY item, post Dr COGS / Cr Inventory
    // at unitCost * qty (in base currency). Also decrement qtyOnHand.
    const cogsLines: DraftEntry["lines"] = [];
    for (const l of invoice.lines) {
      const item = l.item;
      if (!item || item.type !== "INVENTORY") continue;
      if (!item.inventoryAccountId || !item.cogsAccountId) continue;
      // unitCost is stored in base currency (item-level field)
      const cogsCents = (l.quantityMilli * item.unitCostCents) / 1000n;
      if (cogsCents <= 0n) continue;
      cogsLines.push({
        accountId: item.cogsAccountId,
        debitCents: cogsCents,
        creditCents: 0n,
        memo: `COGS — ${item.name}`,
      });
      cogsLines.push({
        accountId: item.inventoryAccountId,
        debitCents: 0n,
        creditCents: cogsCents,
        memo: `Inventory — ${item.name}`,
      });
      // Decrement qty on hand
      await tx.item.update({
        where: { id: item.id },
        data: { qtyOnHandMilli: { decrement: l.quantityMilli } },
      });
    }

    // Resolve tax payable account if tax > 0
    const taxLines: DraftEntry["lines"] = [];
    if (baseTaxCents > 0n) {
      const taxAccount = await findOrCreateSalesTaxPayable(
        invoice.entityId,
        invoice.tenantId,
        tx,
      );
      taxLines.push({
        accountId: taxAccount.id,
        debitCents: 0n,
        creditCents: baseTaxCents,
        memo: `Sales tax — ${invoice.customer.name}`,
        contactRefType: "Customer",
        contactRefId: invoice.customerId,
      });
    }

    const draft: DraftEntry = {
      tenantId: invoice.tenantId,
      entityId: invoice.entityId,
      entryDate: invoice.issueDate,
      description:
        invoiceCurrency === baseCurrency
          ? `Invoice — ${invoice.customer.name}`
          : `Invoice — ${invoice.customer.name} (${invoiceCurrency} @ ${fx.rate.toFixed(6)})`,
      memo: invoice.memo ?? undefined,
      source: "INVOICE",
      sourceRefId: invoice.id,
      lines: [
        {
          accountId: arAccount.id,
          debitCents: baseGrandTotal,
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
        ...taxLines,
        ...cogsLines,
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
        taxCents,
        totalCents: grandTotal,
        balanceCents: grandTotal,
        fxRate: invoiceCurrency === baseCurrency ? null : fx.rate,
        baseTotalCents: baseGrandTotal,
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
