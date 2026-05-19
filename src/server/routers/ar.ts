/**
 * Accounts Receivable router — customers, invoices, payments, aging.
 *
 * Money is BigInt cents on the wire; we serialize/deserialize via z.string()
 * to keep tRPC's JSON transport happy.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { postInvoice, recordInvoicePayment, ageBucket } from "@/lib/accounting/ar";
import { formatCents } from "@/lib/accounting/ledger";

const BIGINT_FROM_STRING = z
  .string()
  .regex(/^\d+$/)
  .transform((s) => BigInt(s));

export const arRouter = router({
  /** List customers for the active entity. */
  listCustomers: protectedProcedure
    .input(z.object({ entityId: z.string(), activeOnly: z.boolean().default(true) }))
    .query(async ({ ctx, input }) => {
      const customers = await db.customer.findMany({
        where: {
          tenantId: ctx.auth.tenant.id,
          entityId: input.entityId,
          ...(input.activeOnly ? { isActive: true } : {}),
        },
        orderBy: { name: "asc" },
      });
      return customers;
    }),

  /** Create a new customer. */
  createCustomer: protectedProcedure
    .input(
      z.object({
        entityId: z.string(),
        name: z.string().min(1).max(200),
        email: z.string().email().optional(),
        phone: z.string().max(50).optional(),
        defaultTermsDays: z.number().int().min(0).max(365).default(30),
        billingAddress: z.string().max(500).optional(),
        notes: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(ctx.auth.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const entity = await db.entity.findFirst({
        where: { id: input.entityId, tenantId: ctx.auth.tenant.id },
        select: { id: true },
      });
      if (!entity) throw new TRPCError({ code: "NOT_FOUND", message: "Entity not found." });

      try {
        const customer = await db.customer.create({
          data: {
            tenantId: ctx.auth.tenant.id,
            entityId: input.entityId,
            name: input.name,
            email: input.email,
            phone: input.phone,
            defaultTermsDays: input.defaultTermsDays,
            billingAddress: input.billingAddress,
            notes: input.notes,
          },
        });
        return { id: customer.id };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        if (msg.includes("Unique constraint")) {
          throw new TRPCError({ code: "CONFLICT", message: "A customer with that name already exists." });
        }
        throw new TRPCError({ code: "BAD_REQUEST", message: msg });
      }
    }),

  /** Post a journal entry that creates AND posts an invoice in one go. */
  createAndPostInvoice: protectedProcedure
    .input(
      z.object({
        entityId: z.string(),
        customerId: z.string(),
        issueDate: z.string().datetime(),
        dueDate: z.string().datetime().optional(),
        memo: z.string().max(2000).optional(),
        lines: z
          .array(
            z.object({
              accountId: z.string(),
              description: z.string().min(1).max(500),
              quantityMilli: BIGINT_FROM_STRING.default("1000"),
              unitPriceCents: BIGINT_FROM_STRING,
            })
          )
          .min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(ctx.auth.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const customer = await db.customer.findFirst({
        where: {
          id: input.customerId,
          tenantId: ctx.auth.tenant.id,
          entityId: input.entityId,
        },
      });
      if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found." });

      const issueDate = new Date(input.issueDate);
      const dueDate = input.dueDate
        ? new Date(input.dueDate)
        : new Date(issueDate.getTime() + customer.defaultTermsDays * 86400_000);

      try {
        // Create DRAFT invoice with lines, then post
        const draft = await db.invoice.create({
          data: {
            tenantId: ctx.auth.tenant.id,
            entityId: input.entityId,
            customerId: input.customerId,
            invoiceNumber: 0, // assigned on post
            issueDate,
            dueDate,
            status: "DRAFT",
            memo: input.memo,
            lines: {
              create: input.lines.map((l, i) => {
                const amountCents = (l.quantityMilli * l.unitPriceCents) / 1000n;
                return {
                  tenantId: ctx.auth.tenant.id,
                  accountId: l.accountId,
                  description: l.description,
                  quantityMilli: l.quantityMilli,
                  unitPriceCents: l.unitPriceCents,
                  amountCents,
                  lineNumber: i + 1,
                };
              }),
            },
          },
        });

        const posted = await postInvoice(draft.id, { postedByUserId: ctx.auth.user.id });
        return {
          id: posted.id,
          invoiceNumber: posted.invoiceNumber,
          totalCentsDisplay: formatCents(posted.totalCents),
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        throw new TRPCError({ code: "BAD_REQUEST", message: msg });
      }
    }),

  /** Record a payment against an open invoice. */
  recordPayment: protectedProcedure
    .input(
      z.object({
        invoiceId: z.string(),
        paymentDate: z.string().datetime(),
        amountCents: BIGINT_FROM_STRING,
        cashAccountId: z.string(),
        method: z.string().max(50).optional(),
        reference: z.string().max(100).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(ctx.auth.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      // Verify invoice tenant scope
      const invoice = await db.invoice.findFirst({
        where: { id: input.invoiceId, tenantId: ctx.auth.tenant.id },
        select: { id: true },
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found." });

      try {
        const payment = await recordInvoicePayment({
          invoiceId: input.invoiceId,
          paymentDate: new Date(input.paymentDate),
          amountCents: input.amountCents,
          cashAccountId: input.cashAccountId,
          method: input.method,
          reference: input.reference,
          postedByUserId: ctx.auth.user.id,
        });
        return { id: payment.id };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        throw new TRPCError({ code: "BAD_REQUEST", message: msg });
      }
    }),

  /** AR aging report — buckets open invoice balances by days past due. */
  aging: protectedProcedure
    .input(
      z.object({
        entityId: z.string(),
        asOfDate: z.string().datetime().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const asOf = input.asOfDate ? new Date(input.asOfDate) : new Date();

      const invoices = await db.invoice.findMany({
        where: {
          tenantId: ctx.auth.tenant.id,
          entityId: input.entityId,
          status: { in: ["OPEN", "PARTIAL"] },
        },
        include: {
          customer: { select: { id: true, name: true, email: true } },
        },
        orderBy: { dueDate: "asc" },
      });

      // Per-customer bucket aggregation
      type Buckets = {
        current: bigint;
        d1_30: bigint;
        d31_60: bigint;
        d61_90: bigint;
        over90: bigint;
        total: bigint;
      };

      const byCustomer = new Map<
        string,
        { customerId: string; customerName: string; email: string | null; buckets: Buckets; invoices: typeof invoices }
      >();

      for (const inv of invoices) {
        const bucket = ageBucket(inv.dueDate, asOf);
        const existing = byCustomer.get(inv.customerId) ?? {
          customerId: inv.customerId,
          customerName: inv.customer.name,
          email: inv.customer.email,
          buckets: {
            current: 0n,
            d1_30: 0n,
            d31_60: 0n,
            d61_90: 0n,
            over90: 0n,
            total: 0n,
          },
          invoices: [] as typeof invoices,
        };
        const b = existing.buckets;
        const amt = inv.balanceCents;
        if (bucket === "CURRENT") b.current += amt;
        else if (bucket === "DAYS_1_30") b.d1_30 += amt;
        else if (bucket === "DAYS_31_60") b.d31_60 += amt;
        else if (bucket === "DAYS_61_90") b.d61_90 += amt;
        else b.over90 += amt;
        b.total += amt;
        existing.invoices.push(inv);
        byCustomer.set(inv.customerId, existing);
      }

      const customers = Array.from(byCustomer.values())
        .sort((a, b) => (a.buckets.total > b.buckets.total ? -1 : 1));

      // Grand totals
      const grand: Buckets = {
        current: 0n,
        d1_30: 0n,
        d31_60: 0n,
        d61_90: 0n,
        over90: 0n,
        total: 0n,
      };
      for (const c of customers) {
        grand.current += c.buckets.current;
        grand.d1_30 += c.buckets.d1_30;
        grand.d31_60 += c.buckets.d31_60;
        grand.d61_90 += c.buckets.d61_90;
        grand.over90 += c.buckets.over90;
        grand.total += c.buckets.total;
      }

      // Serialize for tRPC transport
      const serializeBuckets = (b: Buckets) => ({
        currentCents: b.current.toString(),
        currentDisplay: formatCents(b.current),
        d1_30Cents: b.d1_30.toString(),
        d1_30Display: formatCents(b.d1_30),
        d31_60Cents: b.d31_60.toString(),
        d31_60Display: formatCents(b.d31_60),
        d61_90Cents: b.d61_90.toString(),
        d61_90Display: formatCents(b.d61_90),
        over90Cents: b.over90.toString(),
        over90Display: formatCents(b.over90),
        totalCents: b.total.toString(),
        totalDisplay: formatCents(b.total),
      });

      return {
        asOf: asOf.toISOString(),
        customers: customers.map((c) => ({
          customerId: c.customerId,
          customerName: c.customerName,
          email: c.email,
          buckets: serializeBuckets(c.buckets),
          invoices: c.invoices.map((inv) => ({
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            issueDate: inv.issueDate.toISOString(),
            dueDate: inv.dueDate.toISOString(),
            status: inv.status,
            balanceCents: inv.balanceCents.toString(),
            balanceDisplay: formatCents(inv.balanceCents),
            totalCents: inv.totalCents.toString(),
            totalDisplay: formatCents(inv.totalCents),
            daysPastDue: Math.max(
              0,
              Math.floor((asOf.getTime() - inv.dueDate.getTime()) / 86400_000)
            ),
            bucket: ageBucket(inv.dueDate, asOf),
          })),
        })),
        grandTotal: serializeBuckets(grand),
        customerCount: customers.length,
        invoiceCount: invoices.length,
      };
    }),
});
