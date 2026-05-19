/**
 * Accounts Payable posting logic.
 *
 * Bill lifecycle:
 *   DRAFT -> OPEN (posts JE: Dr Expense/Asset (lines) / Cr AP)
 *   OPEN -> PARTIAL/PAID (each payment posts JE: Dr AP / Cr Cash)
 *   OPEN/PARTIAL -> VOID (reverses original JE; only if no payments applied)
 *
 * All money math is BigInt cents. Bill totals and balances are recomputed
 * on every line / payment write.
 */
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { postJournalEntry, LedgerError, type DraftEntry } from "./ledger";

/** Find the canonical AP account for an entity (code "2000" by convention). */
export async function findApAccount(entityId: string) {
  const account = await db.account.findFirst({
    where: {
      entityId,
      OR: [{ code: "2000" }, { name: { contains: "Payable", mode: "insensitive" } }],
      type: "LIABILITY",
      isActive: true,
    },
    orderBy: { code: "asc" },
  });
  if (!account) {
    throw new LedgerError(
      "AP_ACCOUNT_NOT_FOUND",
      "No Accounts Payable account found for this entity. Add one with code 2000."
    );
  }
  return account;
}

/** Recompute totalCents / balanceCents from current line + payment rows. */
export async function recomputeBillTotals(
  billId: string,
  client: Prisma.TransactionClient | typeof db = db
) {
  const lines = await client.billLine.findMany({
    where: { billId },
    select: { amountCents: true },
  });
  const subtotal = lines.reduce((s, l) => s + l.amountCents, 0n);
  const total = subtotal;
  const paid = await client.billPayment.aggregate({
    where: { billId },
    _sum: { amountCents: true },
  });
  const paidCents = paid._sum.amountCents ?? 0n;
  const balanceCents = total - paidCents;

  return client.bill.update({
    where: { id: billId },
    data: {
      subtotalCents: subtotal,
      totalCents: total,
      paidCents,
      balanceCents,
    },
  });
}

/** Post a DRAFT bill to the ledger. */
export async function postBill(
  billId: string,
  options: { postedByUserId?: string } = {}
) {
  return db.$transaction(async (tx) => {
    const bill = await tx.bill.findUnique({
      where: { id: billId },
      include: {
        lines: { include: { account: true } },
        vendor: true,
      },
    });
    if (!bill) throw new LedgerError("NOT_FOUND", "Bill not found.");
    if (bill.status !== "DRAFT") {
      throw new LedgerError("ALREADY_POSTED", `Bill is ${bill.status}, not DRAFT.`);
    }
    if (bill.lines.length === 0) {
      throw new LedgerError("NO_LINES", "Bill has no lines.");
    }

    const apAccount = await findApAccount(bill.entityId);

    const subtotal = bill.lines.reduce((s, l) => s + l.amountCents, 0n);
    if (subtotal <= 0n) {
      throw new LedgerError("ZERO_TOTAL", "Bill total must be > 0.");
    }

    // Group debits by accountId to consolidate
    const debitsByAccount = new Map<string, bigint>();
    for (const l of bill.lines) {
      debitsByAccount.set(
        l.accountId,
        (debitsByAccount.get(l.accountId) ?? 0n) + l.amountCents
      );
    }

    const draft: DraftEntry = {
      tenantId: bill.tenantId,
      entityId: bill.entityId,
      entryDate: bill.billDate,
      description: `Bill — ${bill.vendor.name}`,
      memo: bill.memo ?? undefined,
      source: "MANUAL",
      sourceRefId: bill.id,
      lines: [
        ...Array.from(debitsByAccount.entries()).map(([accountId, cents]) => ({
          accountId,
          debitCents: cents,
          creditCents: 0n,
          contactRefType: "Vendor",
          contactRefId: bill.vendorId,
        })),
        {
          accountId: apAccount.id,
          debitCents: 0n,
          creditCents: subtotal,
          memo: `AP — ${bill.vendor.name}`,
          contactRefType: "Vendor",
          contactRefId: bill.vendorId,
        },
      ],
    };

    const je = await postJournalEntry(draft, {
      postedByUserId: options.postedByUserId,
      client: tx,
    });

    // Assign sequential billNumber per entity
    const maxNumber = await tx.bill.aggregate({
      where: { entityId: bill.entityId, billNumber: { gt: 0 } },
      _max: { billNumber: true },
    });
    const nextNumber = (maxNumber._max.billNumber ?? 0) + 1;

    const updated = await tx.bill.update({
      where: { id: bill.id },
      data: {
        status: "OPEN",
        billNumber: nextNumber,
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
 * Record a payment to a vendor. Posts JE: Dr AP / Cr cashAccount.
 * Updates bill.paidCents, balanceCents, and status (PARTIAL or PAID).
 */
export async function recordBillPayment(args: {
  billId: string;
  paymentDate: Date;
  amountCents: bigint;
  cashAccountId: string;
  method?: string;
  reference?: string;
  postedByUserId?: string;
}) {
  return db.$transaction(async (tx) => {
    const bill = await tx.bill.findUnique({
      where: { id: args.billId },
      include: { vendor: true },
    });
    if (!bill) throw new LedgerError("NOT_FOUND", "Bill not found.");
    if (bill.status === "DRAFT") {
      throw new LedgerError("NOT_POSTED", "Bill must be posted (OPEN) before payment.");
    }
    if (bill.status === "VOID") {
      throw new LedgerError("VOID", "Cannot pay a voided bill.");
    }
    if (bill.status === "PAID") {
      throw new LedgerError("ALREADY_PAID", "Bill is already fully paid.");
    }
    if (args.amountCents <= 0n) {
      throw new LedgerError("BAD_AMOUNT", "Payment amount must be > 0.");
    }
    if (args.amountCents > bill.balanceCents) {
      throw new LedgerError(
        "OVERPAYMENT",
        `Payment ${args.amountCents} exceeds open balance ${bill.balanceCents}.`
      );
    }

    const apAccount = await findApAccount(bill.entityId);

    const draft: DraftEntry = {
      tenantId: bill.tenantId,
      entityId: bill.entityId,
      entryDate: args.paymentDate,
      description: `Payment — ${bill.vendor.name} (Bill #${bill.billNumber})`,
      memo: args.reference ?? args.method ?? undefined,
      source: "MANUAL",
      sourceRefId: bill.id,
      lines: [
        {
          accountId: apAccount.id,
          debitCents: args.amountCents,
          creditCents: 0n,
          memo: `Applied to Bill #${bill.billNumber}`,
          contactRefType: "Vendor",
          contactRefId: bill.vendorId,
        },
        {
          accountId: args.cashAccountId,
          debitCents: 0n,
          creditCents: args.amountCents,
          memo: `Payment to ${bill.vendor.name}`,
          contactRefType: "Vendor",
          contactRefId: bill.vendorId,
        },
      ],
    };

    const je = await postJournalEntry(draft, {
      postedByUserId: args.postedByUserId,
      client: tx,
    });

    const payment = await tx.billPayment.create({
      data: {
        tenantId: bill.tenantId,
        billId: bill.id,
        paymentDate: args.paymentDate,
        amountCents: args.amountCents,
        cashAccountId: args.cashAccountId,
        method: args.method,
        reference: args.reference,
        journalEntryId: je.id,
      },
    });

    const newPaid = bill.paidCents + args.amountCents;
    const newBalance = bill.totalCents - newPaid;
    const newStatus = newBalance === 0n ? "PAID" : "PARTIAL";

    await tx.bill.update({
      where: { id: bill.id },
      data: {
        paidCents: newPaid,
        balanceCents: newBalance,
        status: newStatus,
      },
    });

    return payment;
  });
}

/** Bucket a bill by age relative to a reference date (default: today). */
export function apAgeBucket(dueDate: Date, asOf: Date = new Date()) {
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysPastDue = Math.floor((asOf.getTime() - dueDate.getTime()) / msPerDay);
  if (daysPastDue < 0) return "CURRENT" as const;
  if (daysPastDue <= 30) return "DAYS_1_30" as const;
  if (daysPastDue <= 60) return "DAYS_31_60" as const;
  if (daysPastDue <= 90) return "DAYS_61_90" as const;
  return "DAYS_OVER_90" as const;
}

export type ApAgeBucket = ReturnType<typeof apAgeBucket>;
