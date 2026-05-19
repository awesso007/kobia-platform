/**
 * Bookkeeping router — Cycle 2 foundation routes.
 * Adds entity listing, chart of accounts, trial balance, and journal entry posting.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { postJournalEntry, formatCents, normalBalanceSign } from "@/lib/accounting/ledger";

const BIGINT_FROM_STRING = z.string().regex(/^\d+$/).transform((s) => BigInt(s));

export const booksRouter = router({
  status: protectedProcedure.query(({ ctx }) => ({
    tenantId: ctx.auth.tenant.id,
    tenantName: ctx.auth.tenant.name,
    module: "books",
    cycle: 2,
    status: "foundation-live",
  })),

  /** List all entities (client books) for this tenant. */
  listEntities: protectedProcedure.query(async ({ ctx }) => {
    return db.entity.findMany({
      where: { tenantId: ctx.auth.tenant.id, isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        legalName: true,
        industry: true,
        baseCurrency: true,
        fiscalYearEnd: true,
        _count: { select: { accounts: true, journalEntries: true } },
      },
    });
  }),

  /** Get the chart of accounts for an entity. */
  chartOfAccounts: protectedProcedure
    .input(z.object({ entityId: z.string() }))
    .query(async ({ ctx, input }) => {
      const accounts = await db.account.findMany({
        where: { entityId: input.entityId, tenantId: ctx.auth.tenant.id },
        orderBy: { code: "asc" },
      });
      // Serialize BigInt → string for client (tRPC + superjson handles BigInt, but be explicit)
      return accounts.map((a) => ({
        ...a,
        balanceCents: a.balanceCents.toString(),
      }));
    }),

  /**
   * Trial balance: sum debits/credits per account, plus totals.
   * Uses cached Account.balanceCents (updated on every post).
   */
  trialBalance: protectedProcedure
    .input(z.object({ entityId: z.string() }))
    .query(async ({ ctx, input }) => {
      const accounts = await db.account.findMany({
        where: { entityId: input.entityId, tenantId: ctx.auth.tenant.id, isActive: true },
        orderBy: { code: "asc" },
      });

      let totalDebit = 0n;
      let totalCredit = 0n;

      const rows = accounts.map((a) => {
        const isDebitNormal = normalBalanceSign(a.type) === 1;
        const bal = a.balanceCents;
        const debit = isDebitNormal ? (bal > 0n ? bal : 0n) : (bal < 0n ? -bal : 0n);
        const credit = isDebitNormal ? (bal < 0n ? -bal : 0n) : (bal > 0n ? bal : 0n);
        totalDebit += debit;
        totalCredit += credit;
        return {
          accountId: a.id,
          code: a.code,
          name: a.name,
          type: a.type,
          debit: debit.toString(),
          credit: credit.toString(),
          debitDisplay: debit > 0n ? formatCents(debit) : "",
          creditDisplay: credit > 0n ? formatCents(credit) : "",
          isZero: bal === 0n,
        };
      });

      return {
        rows,
        totalDebit: totalDebit.toString(),
        totalCredit: totalCredit.toString(),
        totalDebitDisplay: formatCents(totalDebit),
        totalCreditDisplay: formatCents(totalCredit),
        balanced: totalDebit === totalCredit,
        difference: formatCents(totalDebit - totalCredit),
      };
    }),

  /** List recent journal entries for an entity. */
  listJournalEntries: protectedProcedure
    .input(z.object({ entityId: z.string(), limit: z.number().min(1).max(100).default(25) }))
    .query(async ({ ctx, input }) => {
      const entries = await db.journalEntry.findMany({
        where: { entityId: input.entityId, tenantId: ctx.auth.tenant.id },
        orderBy: { entryNumber: "desc" },
        take: input.limit,
        include: {
          lines: {
            include: { account: { select: { code: true, name: true, type: true } } },
            orderBy: { lineNumber: "asc" },
          },
        },
      });
      return entries.map((e) => ({
        ...e,
        lines: e.lines.map((l) => ({
          ...l,
          debitCents: l.debitCents.toString(),
          creditCents: l.creditCents.toString(),
        })),
      }));
    }),

  /** Post a manual journal entry. */
  postJournalEntry: protectedProcedure
    .input(
      z.object({
        entityId: z.string(),
        entryDate: z.string().datetime(),
        description: z.string().min(1).max(500),
        memo: z.string().max(2000).optional(),
        lines: z
          .array(
            z.object({
              accountId: z.string(),
              debitCents: BIGINT_FROM_STRING.default("0"),
              creditCents: BIGINT_FROM_STRING.default("0"),
              memo: z.string().max(500).optional(),
              classTag: z.string().max(100).optional(),
            })
          )
          .min(2),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(ctx.auth.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only accountants can post entries." });
      }

      // Verify entity belongs to tenant
      const entity = await db.entity.findFirst({
        where: { id: input.entityId, tenantId: ctx.auth.tenant.id },
      });
      if (!entity) throw new TRPCError({ code: "NOT_FOUND", message: "Entity not found." });

      try {
        const entry = await postJournalEntry(
          {
            tenantId: ctx.auth.tenant.id,
            entityId: input.entityId,
            entryDate: new Date(input.entryDate),
            description: input.description,
            memo: input.memo,
            source: "MANUAL",
            lines: input.lines,
          },
          { postedByUserId: ctx.auth.user.id }
        );
        return { id: entry.id, entryNumber: entry.entryNumber };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        throw new TRPCError({ code: "BAD_REQUEST", message: msg });
      }
    }),
});
