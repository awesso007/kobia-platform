/**
 * Bookkeeping router — Cycle 2 foundation routes.
 * Adds entity listing, chart of accounts, trial balance, and journal entry posting.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import { postJournalEntry, reverseJournalEntry, formatCents, normalBalanceSign } from "@/lib/accounting/ledger";

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

  /**
   * Profit & Loss for an entity, optionally bounded by date range.
   * Sums posted JE lines (NOT cached balances) so the report respects entryDate.
   * Revenue/OtherIncome - Expense/COGS/OtherExpense = Net Income.
   */
  profitAndLoss: protectedProcedure
    .input(
      z.object({
        entityId: z.string(),
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const dateFilter: { gte?: Date; lte?: Date } = {};
      if (input.startDate) dateFilter.gte = new Date(input.startDate);
      if (input.endDate) dateFilter.lte = new Date(input.endDate);

      const accounts = await db.account.findMany({
        where: {
          entityId: input.entityId,
          tenantId: ctx.auth.tenant.id,
          type: { in: ["REVENUE", "OTHER_INCOME", "EXPENSE", "COGS", "OTHER_EXPENSE"] },
        },
        orderBy: [{ type: "asc" }, { code: "asc" }],
        include: {
          journalLines: {
            where: {
              journalEntry: {
                // Include POSTED and REVERSED — reversed entries are matched by
                // their reversing entries, so net impact stays correct and the
                // P&L mirrors cached account balances.
                status: { in: ["POSTED", "REVERSED"] },
                ...(Object.keys(dateFilter).length ? { entryDate: dateFilter } : {}),
              },
            },
            select: { debitCents: true, creditCents: true },
          },
        },
      });

      type Row = { code: string; name: string; amountCents: bigint; amountDisplay: string };
      const buckets: Record<string, { rows: Row[]; total: bigint }> = {
        REVENUE: { rows: [], total: 0n },
        OTHER_INCOME: { rows: [], total: 0n },
        COGS: { rows: [], total: 0n },
        EXPENSE: { rows: [], total: 0n },
        OTHER_EXPENSE: { rows: [], total: 0n },
      };

      for (const acc of accounts) {
        const sign = BigInt(normalBalanceSign(acc.type));
        let net = 0n;
        for (const l of acc.journalLines) net += (l.debitCents - l.creditCents);
        // Convert to natural-positive amount (revenue positive when credited, expense positive when debited)
        const amount = sign === 1n ? net : -net;
        if (amount === 0n) continue;
        buckets[acc.type]!.rows.push({
          code: acc.code,
          name: acc.name,
          amountCents: amount,
          amountDisplay: formatCents(amount),
        });
        buckets[acc.type]!.total += amount;
      }

      const totalRevenue = buckets.REVENUE!.total + buckets.OTHER_INCOME!.total;
      const totalCOGS = buckets.COGS!.total;
      const grossProfit = totalRevenue - totalCOGS;
      const totalOpex = buckets.EXPENSE!.total;
      const operatingIncome = grossProfit - totalOpex;
      const totalOtherExp = buckets.OTHER_EXPENSE!.total;
      const netIncome = operatingIncome - totalOtherExp;

      const serializeBucket = (b: { rows: Row[]; total: bigint }) => ({
        rows: b.rows.map((r) => ({ ...r, amountCents: r.amountCents.toString() })),
        total: b.total.toString(),
        totalDisplay: formatCents(b.total),
      });

      return {
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        revenue: serializeBucket(buckets.REVENUE!),
        otherIncome: serializeBucket(buckets.OTHER_INCOME!),
        cogs: serializeBucket(buckets.COGS!),
        opex: serializeBucket(buckets.EXPENSE!),
        otherExpense: serializeBucket(buckets.OTHER_EXPENSE!),
        totals: {
          totalRevenue: totalRevenue.toString(),
          totalRevenueDisplay: formatCents(totalRevenue),
          totalCOGS: totalCOGS.toString(),
          totalCOGSDisplay: formatCents(totalCOGS),
          grossProfit: grossProfit.toString(),
          grossProfitDisplay: formatCents(grossProfit),
          totalOpex: totalOpex.toString(),
          totalOpexDisplay: formatCents(totalOpex),
          operatingIncome: operatingIncome.toString(),
          operatingIncomeDisplay: formatCents(operatingIncome),
          totalOtherExpense: totalOtherExp.toString(),
          totalOtherExpenseDisplay: formatCents(totalOtherExp),
          netIncome: netIncome.toString(),
          netIncomeDisplay: formatCents(netIncome),
          grossMarginPct:
            totalRevenue > 0n
              ? Number((grossProfit * 10000n) / totalRevenue) / 100
              : null,
          netMarginPct:
            totalRevenue > 0n
              ? Number((netIncome * 10000n) / totalRevenue) / 100
              : null,
        },
      };
    }),

  /**
   * Balance Sheet — point-in-time snapshot.
   * Uses cached Account.balanceCents (always current as of last posted JE).
   * Assets = Liabilities + Equity + Retained Earnings (Net Income to date).
   */
  balanceSheet: protectedProcedure
    .input(z.object({ entityId: z.string() }))
    .query(async ({ ctx, input }) => {
      const accounts = await db.account.findMany({
        where: { entityId: input.entityId, tenantId: ctx.auth.tenant.id },
        orderBy: [{ type: "asc" }, { code: "asc" }],
      });

      type Row = { code: string; name: string; amountCents: bigint; amountDisplay: string };
      const buckets: Record<string, { rows: Row[]; total: bigint }> = {
        ASSET: { rows: [], total: 0n },
        LIABILITY: { rows: [], total: 0n },
        EQUITY: { rows: [], total: 0n },
      };
      let retainedEarnings = 0n;

      for (const acc of accounts) {
        const bal = acc.balanceCents;
        if (bal === 0n) continue;
        if (acc.type === "ASSET" || acc.type === "LIABILITY" || acc.type === "EQUITY") {
          buckets[acc.type]!.rows.push({
            code: acc.code,
            name: acc.name,
            amountCents: bal,
            amountDisplay: formatCents(bal),
          });
          buckets[acc.type]!.total += bal;
        } else if (acc.type === "REVENUE" || acc.type === "OTHER_INCOME") {
          retainedEarnings += bal;
        } else {
          // EXPENSE / COGS / OTHER_EXPENSE reduce retained earnings
          retainedEarnings -= bal;
        }
      }

      const totalAssets = buckets.ASSET!.total;
      const totalLiabilities = buckets.LIABILITY!.total;
      const totalEquityBooked = buckets.EQUITY!.total;
      const totalEquity = totalEquityBooked + retainedEarnings;
      const balanced = totalAssets === totalLiabilities + totalEquity;

      const serializeBucket = (b: { rows: Row[]; total: bigint }) => ({
        rows: b.rows.map((r) => ({ ...r, amountCents: r.amountCents.toString() })),
        total: b.total.toString(),
        totalDisplay: formatCents(b.total),
      });

      return {
        assets: serializeBucket(buckets.ASSET!),
        liabilities: serializeBucket(buckets.LIABILITY!),
        equity: serializeBucket(buckets.EQUITY!),
        retainedEarnings: retainedEarnings.toString(),
        retainedEarningsDisplay: formatCents(retainedEarnings),
        totals: {
          totalAssets: totalAssets.toString(),
          totalAssetsDisplay: formatCents(totalAssets),
          totalLiabilities: totalLiabilities.toString(),
          totalLiabilitiesDisplay: formatCents(totalLiabilities),
          totalEquity: totalEquity.toString(),
          totalEquityDisplay: formatCents(totalEquity),
          totalLiabilitiesAndEquity: (totalLiabilities + totalEquity).toString(),
          totalLiabilitiesAndEquityDisplay: formatCents(totalLiabilities + totalEquity),
          balanced,
          difference: formatCents(totalAssets - (totalLiabilities + totalEquity)),
        },
      };
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

  /** Reverse a posted journal entry by creating an opposite-signed entry. */
  reverseJournalEntry: protectedProcedure
    .input(
      z.object({
        entryId: z.string(),
        reason: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(ctx.auth.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only accountants can reverse entries." });
      }

      // Verify entry belongs to this tenant
      const original = await db.journalEntry.findFirst({
        where: { id: input.entryId, tenantId: ctx.auth.tenant.id },
        select: { id: true, status: true },
      });
      if (!original) throw new TRPCError({ code: "NOT_FOUND", message: "Journal entry not found." });
      if (original.status !== "POSTED") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Only POSTED entries can be reversed (this one is ${original.status}).` });
      }

      try {
        const reversing = await reverseJournalEntry(input.entryId, {
          reason: input.reason,
          postedByUserId: ctx.auth.user.id,
        });
        return { id: reversing.id, entryNumber: reversing.entryNumber };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        throw new TRPCError({ code: "BAD_REQUEST", message: msg });
      }
    }),
});
