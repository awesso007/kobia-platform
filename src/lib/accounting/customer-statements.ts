/**
 * Customer Statements — monthly account statement per customer.
 *
 * Two flavors are supported by the same library:
 *  - "open-item" statement: lists all unpaid invoices as of asOf with aging
 *  - "activity" statement: lists every invoice + payment in a date range with running balance
 *
 * Both formats reflect the GL: invoices increase customer balance, payments decrease it.
 */

import type { PrismaClient } from "@prisma/client";
import { db as defaultDb } from "@/lib/db";
import { ageBucket, type AgeBucket } from "@/lib/accounting/ar";

export type StatementInvoiceRow = {
  id: string;
  invoiceNumber: number | null;
  issueDate: Date;
  dueDate: Date;
  totalCents: bigint;
  paidCents: bigint;
  balanceCents: bigint;
  status: string;
  daysOverdue: number;
  bucket: AgeBucket;
};

export type StatementActivityRow =
  | {
      kind: "INVOICE";
      date: Date;
      reference: string;
      description: string;
      chargeCents: bigint;
      paymentCents: bigint;
      runningBalanceCents: bigint;
    }
  | {
      kind: "PAYMENT";
      date: Date;
      reference: string;
      description: string;
      chargeCents: bigint;
      paymentCents: bigint;
      runningBalanceCents: bigint;
    };

export type CustomerStatement = {
  customer: {
    id: string;
    name: string;
    email: string | null;
    billingAddress: string | null;
  };
  entity: { id: string; name: string; baseCurrency: string };
  asOf: Date;
  periodStart: Date | null; // null for open-item statements
  // Open-item view
  openInvoices: StatementInvoiceRow[];
  totalOutstandingCents: bigint;
  buckets: {
    current: bigint;
    d1_30: bigint;
    d31_60: bigint;
    d61_90: bigint;
    over90: bigint;
  };
  // Activity view (only present if periodStart is set)
  activity: StatementActivityRow[];
  beginningBalanceCents: bigint;
  endingBalanceCents: bigint;
};

function daysBetween(later: Date, earlier: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / (1000 * 60 * 60 * 24));
}

/** Open-item statement: all unpaid invoices as of asOf. */
export async function getOpenItemStatement(opts: {
  tenantId: string;
  entityId: string;
  customerId: string;
  asOf: Date;
  client?: PrismaClient;
}): Promise<CustomerStatement> {
  const client = opts.client ?? defaultDb;

  const [customer, entity] = await Promise.all([
    client.customer.findFirst({
      where: { id: opts.customerId, tenantId: opts.tenantId, entityId: opts.entityId },
      select: { id: true, name: true, email: true, billingAddress: true },
    }),
    client.entity.findFirst({
      where: { id: opts.entityId, tenantId: opts.tenantId },
      select: { id: true, name: true, baseCurrency: true },
    }),
  ]);
  if (!customer) throw new Error("Customer not found");
  if (!entity) throw new Error("Entity not found");

  const invoices = await client.invoice.findMany({
    where: {
      tenantId: opts.tenantId,
      entityId: opts.entityId,
      customerId: opts.customerId,
      status: { in: ["OPEN", "PARTIAL"] },
      issueDate: { lte: opts.asOf },
    },
    orderBy: { dueDate: "asc" },
  });

  const openInvoices: StatementInvoiceRow[] = [];
  let total = 0n;
  const buckets = { current: 0n, d1_30: 0n, d31_60: 0n, d61_90: 0n, over90: 0n };

  for (const inv of invoices) {
    if (inv.balanceCents <= 0n) continue;
    const b = ageBucket(inv.dueDate, opts.asOf);
    const daysOver = inv.dueDate < opts.asOf ? daysBetween(opts.asOf, inv.dueDate) : 0;
    openInvoices.push({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      totalCents: inv.totalCents,
      paidCents: inv.paidCents,
      balanceCents: inv.balanceCents,
      status: inv.status,
      daysOverdue: daysOver,
      bucket: b,
    });
    total += inv.balanceCents;
    if (b === "CURRENT") buckets.current += inv.balanceCents;
    else if (b === "DAYS_1_30") buckets.d1_30 += inv.balanceCents;
    else if (b === "DAYS_31_60") buckets.d31_60 += inv.balanceCents;
    else if (b === "DAYS_61_90") buckets.d61_90 += inv.balanceCents;
    else buckets.over90 += inv.balanceCents;
  }

  return {
    customer,
    entity,
    asOf: opts.asOf,
    periodStart: null,
    openInvoices,
    totalOutstandingCents: total,
    buckets,
    activity: [],
    beginningBalanceCents: 0n,
    endingBalanceCents: total,
  };
}

/** Activity statement: invoices + payments in [periodStart, asOf] with running balance. */
export async function getActivityStatement(opts: {
  tenantId: string;
  entityId: string;
  customerId: string;
  periodStart: Date;
  asOf: Date;
  client?: PrismaClient;
}): Promise<CustomerStatement> {
  const client = opts.client ?? defaultDb;

  const [customer, entity] = await Promise.all([
    client.customer.findFirst({
      where: { id: opts.customerId, tenantId: opts.tenantId, entityId: opts.entityId },
      select: { id: true, name: true, email: true, billingAddress: true },
    }),
    client.entity.findFirst({
      where: { id: opts.entityId, tenantId: opts.tenantId },
      select: { id: true, name: true, baseCurrency: true },
    }),
  ]);
  if (!customer) throw new Error("Customer not found");
  if (!entity) throw new Error("Entity not found");

  // Beginning balance = sum of (invoice totals - payments) BEFORE periodStart
  const priorInvoices = await client.invoice.findMany({
    where: {
      tenantId: opts.tenantId,
      entityId: opts.entityId,
      customerId: opts.customerId,
      status: { in: ["OPEN", "PARTIAL", "PAID"] },
      issueDate: { lt: opts.periodStart },
    },
    select: { id: true, totalCents: true },
  });
  const priorInvoiceIds = priorInvoices.map((i) => i.id);
  const priorInvoiceTotal = priorInvoices.reduce((s, i) => s + i.totalCents, 0n);

  const priorPayments = await client.invoicePayment.aggregate({
    where: {
      tenantId: opts.tenantId,
      invoiceId: { in: priorInvoiceIds },
      paymentDate: { lt: opts.periodStart },
    },
    _sum: { amountCents: true },
  });
  const priorPaymentTotal = priorPayments._sum.amountCents ?? 0n;
  const beginningBalance = priorInvoiceTotal - priorPaymentTotal;

  // Period invoices + payments
  const invoicesInPeriod = await client.invoice.findMany({
    where: {
      tenantId: opts.tenantId,
      entityId: opts.entityId,
      customerId: opts.customerId,
      status: { in: ["OPEN", "PARTIAL", "PAID"] },
      issueDate: { gte: opts.periodStart, lte: opts.asOf },
    },
    select: { id: true, invoiceNumber: true, issueDate: true, totalCents: true, memo: true },
  });

  // Payments in period: include those against any of this customer's invoices
  const allCustomerInvoices = await client.invoice.findMany({
    where: {
      tenantId: opts.tenantId,
      entityId: opts.entityId,
      customerId: opts.customerId,
    },
    select: { id: true },
  });
  const paymentsInPeriod = await client.invoicePayment.findMany({
    where: {
      tenantId: opts.tenantId,
      invoiceId: { in: allCustomerInvoices.map((i) => i.id) },
      paymentDate: { gte: opts.periodStart, lte: opts.asOf },
    },
    include: {
      invoice: { select: { invoiceNumber: true } },
    },
    orderBy: { paymentDate: "asc" },
  });

  type Item = {
    date: Date;
    sortKey: number;
    invoiceRow?: (typeof invoicesInPeriod)[number];
    paymentRow?: (typeof paymentsInPeriod)[number];
  };
  const items: Item[] = [];
  for (const inv of invoicesInPeriod) {
    items.push({ date: inv.issueDate, sortKey: 0, invoiceRow: inv });
  }
  for (const pay of paymentsInPeriod) {
    items.push({ date: pay.paymentDate, sortKey: 1, paymentRow: pay });
  }
  items.sort((a, b) => {
    const t = a.date.getTime() - b.date.getTime();
    if (t !== 0) return t;
    return a.sortKey - b.sortKey;
  });

  const activity: StatementActivityRow[] = [];
  let running = beginningBalance;
  for (const it of items) {
    if (it.invoiceRow) {
      running += it.invoiceRow.totalCents;
      activity.push({
        kind: "INVOICE",
        date: it.invoiceRow.issueDate,
        reference: it.invoiceRow.invoiceNumber
          ? `INV-${String(it.invoiceRow.invoiceNumber).padStart(4, "0")}`
          : "Draft",
        description: it.invoiceRow.memo || "Invoice",
        chargeCents: it.invoiceRow.totalCents,
        paymentCents: 0n,
        runningBalanceCents: running,
      });
    } else if (it.paymentRow) {
      running -= it.paymentRow.amountCents;
      const invNum = it.paymentRow.invoice.invoiceNumber;
      activity.push({
        kind: "PAYMENT",
        date: it.paymentRow.paymentDate,
        reference: it.paymentRow.reference || it.paymentRow.method || "Payment",
        description: invNum ? `Payment on INV-${String(invNum).padStart(4, "0")}` : "Payment",
        chargeCents: 0n,
        paymentCents: it.paymentRow.amountCents,
        runningBalanceCents: running,
      });
    }
  }

  // Also compute current open-item summary (so the statement can show aging too)
  const openItem = await getOpenItemStatement({
    tenantId: opts.tenantId,
    entityId: opts.entityId,
    customerId: opts.customerId,
    asOf: opts.asOf,
    client,
  });

  return {
    customer,
    entity,
    asOf: opts.asOf,
    periodStart: opts.periodStart,
    openInvoices: openItem.openInvoices,
    totalOutstandingCents: openItem.totalOutstandingCents,
    buckets: openItem.buckets,
    activity,
    beginningBalanceCents: beginningBalance,
    endingBalanceCents: running,
  };
}

/** List all customers in the entity with their current open balance, for the statements index. */
export async function listCustomersWithBalance(opts: {
  tenantId: string;
  entityId: string;
  asOf: Date;
  client?: PrismaClient;
}): Promise<
  Array<{
    id: string;
    name: string;
    email: string | null;
    balanceCents: bigint;
    openInvoiceCount: number;
    oldestDaysOverdue: number;
  }>
> {
  const client = opts.client ?? defaultDb;
  const customers = await client.customer.findMany({
    where: { tenantId: opts.tenantId, entityId: opts.entityId, isActive: true },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });

  const openInvoices = await client.invoice.findMany({
    where: {
      tenantId: opts.tenantId,
      entityId: opts.entityId,
      status: { in: ["OPEN", "PARTIAL"] },
      issueDate: { lte: opts.asOf },
    },
    select: { customerId: true, dueDate: true, balanceCents: true },
  });

  const byCust = new Map<string, { balance: bigint; count: number; oldestOver: number }>();
  for (const inv of openInvoices) {
    if (inv.balanceCents <= 0n) continue;
    const e = byCust.get(inv.customerId) ?? { balance: 0n, count: 0, oldestOver: 0 };
    e.balance += inv.balanceCents;
    e.count += 1;
    const over = inv.dueDate < opts.asOf ? daysBetween(opts.asOf, inv.dueDate) : 0;
    if (over > e.oldestOver) e.oldestOver = over;
    byCust.set(inv.customerId, e);
  }

  return customers.map((c) => {
    const e = byCust.get(c.id);
    return {
      id: c.id,
      name: c.name,
      email: c.email,
      balanceCents: e?.balance ?? 0n,
      openInvoiceCount: e?.count ?? 0,
      oldestDaysOverdue: e?.oldestOver ?? 0,
    };
  });
}
