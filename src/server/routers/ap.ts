/**
 * Accounts Payable router — vendors, bills, payments, aging.
 *
 * Mirror of AR router. Money is BigInt cents on the wire; serialized via
 * z.string() to keep tRPC's JSON transport happy.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { postBill, recordBillPayment, apAgeBucket } from "@/lib/accounting/ap";
import {
  checkBillApprovalRequired,
  submitBillForApproval,
} from "@/lib/accounting/approvals";
import { formatCents } from "@/lib/accounting/ledger";

const BIGINT_FROM_STRING = z
  .string()
  .regex(/^\d+$/)
  .transform((s) => BigInt(s));

export const apRouter = router({
  /** List vendors for the active entity. */
  listVendors: protectedProcedure
    .input(z.object({ entityId: z.string(), activeOnly: z.boolean().default(true) }))
    .query(async ({ ctx, input }) => {
      return db.vendor.findMany({
        where: {
          tenantId: ctx.auth.tenant.id,
          entityId: input.entityId,
          ...(input.activeOnly ? { isActive: true } : {}),
        },
        orderBy: { name: "asc" },
      });
    }),

  /** Create a new vendor. */
  createVendor: protectedProcedure
    .input(
      z.object({
        entityId: z.string(),
        name: z.string().min(1).max(200),
        email: z.string().email().optional(),
        phone: z.string().max(50).optional(),
        defaultTermsDays: z.number().int().min(0).max(365).default(30),
        remitToAddress: z.string().max(500).optional(),
        taxId: z.string().max(50).optional(),
        is1099Vendor: z.boolean().default(false),
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
        const vendor = await db.vendor.create({
          data: {
            tenantId: ctx.auth.tenant.id,
            entityId: input.entityId,
            name: input.name,
            email: input.email,
            phone: input.phone,
            defaultTermsDays: input.defaultTermsDays,
            remitToAddress: input.remitToAddress,
            taxId: input.taxId,
            is1099Vendor: input.is1099Vendor,
            notes: input.notes,
          },
        });
        return { id: vendor.id };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        if (msg.includes("Unique constraint")) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A vendor with that name already exists.",
          });
        }
        throw new TRPCError({ code: "BAD_REQUEST", message: msg });
      }
    }),

  /** Create AND post a bill in one shot. */
  createAndPostBill: protectedProcedure
    .input(
      z.object({
        entityId: z.string(),
        vendorId: z.string(),
        billDate: z.string().datetime(),
        dueDate: z.string().datetime().optional(),
        vendorBillNumber: z.string().max(100).optional(),
        memo: z.string().max(2000).optional(),
        currency: z.string().length(3).optional(),
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
      const vendor = await db.vendor.findFirst({
        where: {
          id: input.vendorId,
          tenantId: ctx.auth.tenant.id,
          entityId: input.entityId,
        },
      });
      if (!vendor) throw new TRPCError({ code: "NOT_FOUND", message: "Vendor not found." });

      const billDate = new Date(input.billDate);
      const dueDate = input.dueDate
        ? new Date(input.dueDate)
        : new Date(billDate.getTime() + vendor.defaultTermsDays * 86400_000);

      try {
        const draft = await db.bill.create({
          data: {
            tenantId: ctx.auth.tenant.id,
            entityId: input.entityId,
            vendorId: input.vendorId,
            vendorBillNumber: input.vendorBillNumber,
            billNumber: 0, // assigned on post
            billDate,
            dueDate,
            status: "DRAFT",
            memo: input.memo,
            currency: input.currency,
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

        // Approval workflow gate: compute draft subtotal and check threshold.
        const subtotalCents = input.lines.reduce(
          (s, l) => s + (l.quantityMilli * l.unitPriceCents) / 1000n,
          0n
        );
        const approvalCheck = await checkBillApprovalRequired({
          tenantId: ctx.auth.tenant.id,
          entityId: input.entityId,
          totalCents: subtotalCents,
        });

        if (approvalCheck.required) {
          await submitBillForApproval({
            tenantId: ctx.auth.tenant.id,
            billId: draft.id,
            submittedByUserId: ctx.auth.user.id,
          });
          return {
            id: draft.id,
            billNumber: null,
            totalCentsDisplay: formatCents(subtotalCents),
            pendingApproval: true,
          };
        }

        const posted = await postBill(draft.id, { postedByUserId: ctx.auth.user.id });
        return {
          id: posted.id,
          billNumber: posted.billNumber,
          totalCentsDisplay: formatCents(posted.totalCents),
          pendingApproval: false,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        throw new TRPCError({ code: "BAD_REQUEST", message: msg });
      }
    }),

  /** Record a payment against an open bill. */
  recordPayment: protectedProcedure
    .input(
      z.object({
        billId: z.string(),
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
      const bill = await db.bill.findFirst({
        where: { id: input.billId, tenantId: ctx.auth.tenant.id },
        select: { id: true },
      });
      if (!bill) throw new TRPCError({ code: "NOT_FOUND", message: "Bill not found." });

      try {
        const payment = await recordBillPayment({
          billId: input.billId,
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

  /** AP aging report — buckets open bill balances by days past due. */
  aging: protectedProcedure
    .input(
      z.object({
        entityId: z.string(),
        asOfDate: z.string().datetime().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const asOf = input.asOfDate ? new Date(input.asOfDate) : new Date();

      const bills = await db.bill.findMany({
        where: {
          tenantId: ctx.auth.tenant.id,
          entityId: input.entityId,
          status: { in: ["OPEN", "PARTIAL"] },
        },
        include: {
          vendor: { select: { id: true, name: true, email: true } },
        },
        orderBy: { dueDate: "asc" },
      });

      type Buckets = {
        current: bigint;
        d1_30: bigint;
        d31_60: bigint;
        d61_90: bigint;
        over90: bigint;
        total: bigint;
      };

      const byVendor = new Map<
        string,
        {
          vendorId: string;
          vendorName: string;
          email: string | null;
          buckets: Buckets;
          bills: typeof bills;
        }
      >();

      for (const b of bills) {
        const bucket = apAgeBucket(b.dueDate, asOf);
        const existing = byVendor.get(b.vendorId) ?? {
          vendorId: b.vendorId,
          vendorName: b.vendor.name,
          email: b.vendor.email,
          buckets: {
            current: 0n,
            d1_30: 0n,
            d31_60: 0n,
            d61_90: 0n,
            over90: 0n,
            total: 0n,
          },
          bills: [] as typeof bills,
        };
        const bk = existing.buckets;
        const amt = b.balanceCents;
        if (bucket === "CURRENT") bk.current += amt;
        else if (bucket === "DAYS_1_30") bk.d1_30 += amt;
        else if (bucket === "DAYS_31_60") bk.d31_60 += amt;
        else if (bucket === "DAYS_61_90") bk.d61_90 += amt;
        else bk.over90 += amt;
        bk.total += amt;
        existing.bills.push(b);
        byVendor.set(b.vendorId, existing);
      }

      const vendors = Array.from(byVendor.values()).sort((a, b) =>
        a.buckets.total > b.buckets.total ? -1 : 1
      );

      const grand: Buckets = {
        current: 0n,
        d1_30: 0n,
        d31_60: 0n,
        d61_90: 0n,
        over90: 0n,
        total: 0n,
      };
      for (const v of vendors) {
        grand.current += v.buckets.current;
        grand.d1_30 += v.buckets.d1_30;
        grand.d31_60 += v.buckets.d31_60;
        grand.d61_90 += v.buckets.d61_90;
        grand.over90 += v.buckets.over90;
        grand.total += v.buckets.total;
      }

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
        vendors: vendors.map((v) => ({
          vendorId: v.vendorId,
          vendorName: v.vendorName,
          email: v.email,
          buckets: serializeBuckets(v.buckets),
          bills: v.bills.map((b) => ({
            id: b.id,
            billNumber: b.billNumber,
            vendorBillNumber: b.vendorBillNumber,
            billDate: b.billDate.toISOString(),
            dueDate: b.dueDate.toISOString(),
            status: b.status,
            balanceCents: b.balanceCents.toString(),
            balanceDisplay: formatCents(b.balanceCents),
            totalCents: b.totalCents.toString(),
            totalDisplay: formatCents(b.totalCents),
            daysPastDue: Math.max(
              0,
              Math.floor((asOf.getTime() - b.dueDate.getTime()) / 86400_000)
            ),
            bucket: apAgeBucket(b.dueDate, asOf),
          })),
        })),
        grandTotal: serializeBuckets(grand),
        vendorCount: vendors.length,
        billCount: bills.length,
      };
    }),
});
