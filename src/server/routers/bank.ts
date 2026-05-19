/**
 * Bank reconciliation router — bank accounts, transactions, rules, sessions.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";
import {
  parseBankCsv,
  importCsvRows,
  findMatchCandidates,
  matchToJournalEntry,
  unmatchBankTxn,
  categorizeBankTxn,
  ignoreBankTxn,
  applyRulesToUnmatched,
  computeReconciliationStatus,
  toggleTransactionInSession,
  completeReconciliation,
} from "@/lib/accounting/bank-rec";
import { formatCents } from "@/lib/accounting/ledger";

const BIGINT_FROM_STRING = z
  .string()
  .regex(/^-?\d+$/)
  .transform((s) => BigInt(s));

export const bankRouter = router({
  /** List bank accounts for an entity. */
  listAccounts: protectedProcedure
    .input(z.object({ entityId: z.string(), activeOnly: z.boolean().default(true) }))
    .query(async ({ ctx, input }) => {
      const accounts = await db.bankAccount.findMany({
        where: {
          tenantId: ctx.auth.tenant.id,
          entityId: input.entityId,
          ...(input.activeOnly ? { isActive: true } : {}),
        },
        include: {
          glAccount: { select: { id: true, code: true, name: true, balanceCents: true } },
          _count: { select: { transactions: true } },
        },
        orderBy: { name: "asc" },
      });

      // For each, compute unmatched count
      const withCounts = await Promise.all(
        accounts.map(async (a) => {
          const unmatchedCount = await db.bankTransaction.count({
            where: { bankAccountId: a.id, status: "UNMATCHED" },
          });
          return {
            ...a,
            openingBalanceCents: a.openingBalanceCents.toString(),
            glAccount: {
              ...a.glAccount,
              balanceCents: a.glAccount.balanceCents.toString(),
              balanceDisplay: formatCents(a.glAccount.balanceCents),
            },
            transactionCount: a._count.transactions,
            unmatchedCount,
          };
        })
      );
      return withCounts;
    }),

  /** Create a new bank account linked to a GL account. */
  createAccount: protectedProcedure
    .input(
      z.object({
        entityId: z.string(),
        glAccountId: z.string(),
        name: z.string().min(1).max(200),
        institution: z.string().max(100).optional(),
        accountLast4: z.string().max(10).optional(),
        accountType: z
          .enum(["CHECKING", "SAVINGS", "CREDIT_CARD", "MONEY_MARKET", "LOAN", "OTHER"])
          .default("CHECKING"),
        openingBalanceCents: BIGINT_FROM_STRING.optional(),
        openingBalanceDate: z.string().datetime().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(ctx.auth.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const gl = await db.account.findFirst({
        where: {
          id: input.glAccountId,
          entityId: input.entityId,
          tenantId: ctx.auth.tenant.id,
        },
      });
      if (!gl) throw new TRPCError({ code: "NOT_FOUND", message: "GL account not found." });
      if (gl.type !== "ASSET" && gl.type !== "LIABILITY") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Bank accounts must link to an ASSET or LIABILITY GL account.",
        });
      }
      try {
        const bank = await db.bankAccount.create({
          data: {
            tenantId: ctx.auth.tenant.id,
            entityId: input.entityId,
            glAccountId: input.glAccountId,
            name: input.name,
            institution: input.institution,
            accountLast4: input.accountLast4,
            accountType: input.accountType,
            openingBalanceCents: input.openingBalanceCents ?? 0n,
            openingBalanceDate: input.openingBalanceDate
              ? new Date(input.openingBalanceDate)
              : undefined,
          },
        });
        return { id: bank.id };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        if (msg.includes("Unique constraint")) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "That GL account is already linked to a bank account.",
          });
        }
        throw new TRPCError({ code: "BAD_REQUEST", message: msg });
      }
    }),

  /** Import a CSV of bank transactions. */
  importCsv: protectedProcedure
    .input(
      z.object({
        bankAccountId: z.string(),
        csv: z.string().min(1).max(2_000_000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(ctx.auth.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const bank = await db.bankAccount.findFirst({
        where: { id: input.bankAccountId, tenantId: ctx.auth.tenant.id },
      });
      if (!bank) throw new TRPCError({ code: "NOT_FOUND", message: "Bank account not found." });

      let rows;
      try {
        rows = parseBankCsv(input.csv);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Invalid CSV";
        throw new TRPCError({ code: "BAD_REQUEST", message: msg });
      }
      if (rows.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No transactions found in CSV." });
      }

      const result = await importCsvRows({
        tenantId: ctx.auth.tenant.id,
        bankAccountId: input.bankAccountId,
        rows,
      });

      // Auto-apply rules to newly-imported txns
      const ruleResult = await applyRulesToUnmatched({
        tenantId: ctx.auth.tenant.id,
        bankAccountId: input.bankAccountId,
        userId: ctx.auth.user.id,
      });

      return {
        ...result,
        autoCategorized: ruleResult.categorized,
      };
    }),

  /** List transactions for a bank account, optionally filtered by status. */
  listTransactions: protectedProcedure
    .input(
      z.object({
        bankAccountId: z.string(),
        status: z
          .enum(["UNMATCHED", "MATCHED", "CATEGORIZED", "CLEARED", "IGNORED"])
          .optional(),
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional(),
        limit: z.number().int().min(1).max(500).default(100),
      })
    )
    .query(async ({ ctx, input }) => {
      const txns = await db.bankTransaction.findMany({
        where: {
          tenantId: ctx.auth.tenant.id,
          bankAccountId: input.bankAccountId,
          ...(input.status ? { status: input.status } : {}),
          ...(input.startDate || input.endDate
            ? {
                postedDate: {
                  ...(input.startDate ? { gte: new Date(input.startDate) } : {}),
                  ...(input.endDate ? { lte: new Date(input.endDate) } : {}),
                },
              }
            : {}),
        },
        orderBy: { postedDate: "desc" },
        take: input.limit,
      });
      return txns.map((t) => ({
        id: t.id,
        postedDate: t.postedDate.toISOString(),
        description: t.description,
        amountCents: t.amountCents.toString(),
        amountDisplay: formatCents(t.amountCents),
        balanceAfterCents: t.balanceAfterCents?.toString() ?? null,
        status: t.status,
        matchedJournalEntryId: t.matchedJournalEntryId,
        categorizedJournalEntryId: t.categorizedJournalEntryId,
        reconciliationId: t.reconciliationId,
        notes: t.notes,
      }));
    }),

  /** Find candidate JEs for an unmatched bank txn. */
  findMatches: protectedProcedure
    .input(z.object({ bankTxnId: z.string() }))
    .query(async ({ ctx, input }) => {
      const txn = await db.bankTransaction.findFirst({
        where: { id: input.bankTxnId, tenantId: ctx.auth.tenant.id },
        select: { id: true },
      });
      if (!txn) throw new TRPCError({ code: "NOT_FOUND" });
      const candidates = await findMatchCandidates(input.bankTxnId);
      return candidates.map((c) => ({
        journalEntryId: c.journalEntryId,
        entryNumber: c.entryNumber,
        entryDate: c.entryDate.toISOString(),
        description: c.description,
        amountCents: c.amountCents.toString(),
        amountDisplay: formatCents(c.amountCents),
        source: c.source,
        score: c.score,
        reason: c.reason,
      }));
    }),

  /** Match a bank txn to an existing JE. */
  matchToJE: protectedProcedure
    .input(z.object({ bankTxnId: z.string(), journalEntryId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(ctx.auth.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      try {
        await matchToJournalEntry({
          bankTxnId: input.bankTxnId,
          journalEntryId: input.journalEntryId,
          userId: ctx.auth.user.id,
        });
        return { ok: true };
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : "Failed to match.",
        });
      }
    }),

  /** Unmatch a bank txn. */
  unmatch: protectedProcedure
    .input(z.object({ bankTxnId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(ctx.auth.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      try {
        await unmatchBankTxn(input.bankTxnId);
        return { ok: true };
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : "Failed to unmatch.",
        });
      }
    }),

  /** Categorize a bank txn by creating a new JE. */
  categorize: protectedProcedure
    .input(
      z.object({
        bankTxnId: z.string(),
        offsetAccountId: z.string(),
        memo: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(ctx.auth.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      try {
        await categorizeBankTxn({
          bankTxnId: input.bankTxnId,
          offsetAccountId: input.offsetAccountId,
          memo: input.memo,
          userId: ctx.auth.user.id,
        });
        return { ok: true };
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : "Failed to categorize.",
        });
      }
    }),

  /** Mark a bank txn as ignored. */
  ignore: protectedProcedure
    .input(z.object({ bankTxnId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(ctx.auth.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      try {
        await ignoreBankTxn(input.bankTxnId);
        return { ok: true };
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : "Failed to ignore.",
        });
      }
    }),

  /** Create an auto-categorization rule. */
  createRule: protectedProcedure
    .input(
      z.object({
        bankAccountId: z.string(),
        name: z.string().min(1).max(100),
        descriptionContains: z.string().min(1).max(200),
        offsetAccountId: z.string(),
        appliesToInflow: z.boolean().default(true),
        appliesToOutflow: z.boolean().default(true),
        memoTemplate: z.string().max(500).optional(),
        priority: z.number().int().min(0).max(1000).default(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(ctx.auth.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const rule = await db.bankRule.create({
        data: {
          tenantId: ctx.auth.tenant.id,
          bankAccountId: input.bankAccountId,
          name: input.name,
          descriptionContains: input.descriptionContains,
          offsetAccountId: input.offsetAccountId,
          appliesToInflow: input.appliesToInflow,
          appliesToOutflow: input.appliesToOutflow,
          memoTemplate: input.memoTemplate,
          priority: input.priority,
        },
      });
      // Apply immediately to existing unmatched
      const result = await applyRulesToUnmatched({
        tenantId: ctx.auth.tenant.id,
        bankAccountId: input.bankAccountId,
        userId: ctx.auth.user.id,
      });
      return { id: rule.id, categorizedNow: result.categorized };
    }),

  /** List rules for a bank account. */
  listRules: protectedProcedure
    .input(z.object({ bankAccountId: z.string() }))
    .query(async ({ ctx, input }) => {
      const rules = await db.bankRule.findMany({
        where: { tenantId: ctx.auth.tenant.id, bankAccountId: input.bankAccountId },
        orderBy: [{ isActive: "desc" }, { priority: "asc" }],
      });
      // Hydrate offset account names
      const offsetIds = Array.from(new Set(rules.map((r) => r.offsetAccountId)));
      const offsets = await db.account.findMany({
        where: { id: { in: offsetIds } },
        select: { id: true, code: true, name: true },
      });
      const offsetById = new Map(offsets.map((o) => [o.id, o]));
      return rules.map((r) => ({
        ...r,
        lastAppliedAt: r.lastAppliedAt?.toISOString() ?? null,
        offsetAccount: offsetById.get(r.offsetAccountId) ?? null,
      }));
    }),

  /** Delete a rule. */
  deleteRule: protectedProcedure
    .input(z.object({ ruleId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(ctx.auth.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await db.bankRule.deleteMany({
        where: { id: input.ruleId, tenantId: ctx.auth.tenant.id },
      });
      return { ok: true };
    }),

  /** Start a new reconciliation session. */
  startReconciliation: protectedProcedure
    .input(
      z.object({
        bankAccountId: z.string(),
        statementStartDate: z.string().datetime(),
        statementEndDate: z.string().datetime(),
        statementStartBalanceCents: BIGINT_FROM_STRING,
        statementEndBalanceCents: BIGINT_FROM_STRING,
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(ctx.auth.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      // Block if another in-progress session exists
      const existing = await db.reconciliationSession.findFirst({
        where: { bankAccountId: input.bankAccountId, status: "IN_PROGRESS" },
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "An in-progress reconciliation already exists for this account.",
        });
      }
      const session = await db.reconciliationSession.create({
        data: {
          tenantId: ctx.auth.tenant.id,
          bankAccountId: input.bankAccountId,
          statementStartDate: new Date(input.statementStartDate),
          statementEndDate: new Date(input.statementEndDate),
          statementStartBalanceCents: input.statementStartBalanceCents,
          statementEndBalanceCents: input.statementEndBalanceCents,
          status: "IN_PROGRESS",
        },
      });
      return { id: session.id };
    }),

  /** Get a reconciliation session with live status. */
  getReconciliation: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const session = await db.reconciliationSession.findFirst({
        where: { id: input.sessionId, tenantId: ctx.auth.tenant.id },
        include: { bankAccount: { include: { glAccount: true } } },
      });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });

      const status = await computeReconciliationStatus(input.sessionId);

      // Pull eligible txns in the statement window (MATCHED or CATEGORIZED)
      const eligible = await db.bankTransaction.findMany({
        where: {
          bankAccountId: session.bankAccountId,
          postedDate: {
            gte: session.statementStartDate,
            lte: session.statementEndDate,
          },
          status: { in: ["MATCHED", "CATEGORIZED", "CLEARED"] },
        },
        orderBy: { postedDate: "asc" },
      });

      return {
        id: session.id,
        bankAccountId: session.bankAccountId,
        bankAccountName: session.bankAccount.name,
        statementStartDate: session.statementStartDate.toISOString(),
        statementEndDate: session.statementEndDate.toISOString(),
        statementStartBalanceCents: session.statementStartBalanceCents.toString(),
        statementStartDisplay: formatCents(session.statementStartBalanceCents),
        statementEndBalanceCents: session.statementEndBalanceCents.toString(),
        statementEndDisplay: formatCents(session.statementEndBalanceCents),
        sessionStatus: session.status,
        completedAt: session.completedAt?.toISOString() ?? null,
        status: {
          expectedChangeCents: status.expectedChange.toString(),
          expectedChangeDisplay: formatCents(status.expectedChange),
          clearedTotalCents: status.clearedTotalCents.toString(),
          clearedTotalDisplay: formatCents(status.clearedTotalCents),
          driftCents: status.drift.toString(),
          driftDisplay: formatCents(status.drift),
          unmatchedCount: status.unmatchedCount,
          selectedCount: status.selectedCount,
        },
        transactions: eligible.map((t) => ({
          id: t.id,
          postedDate: t.postedDate.toISOString(),
          description: t.description,
          amountCents: t.amountCents.toString(),
          amountDisplay: formatCents(t.amountCents),
          status: t.status,
          isCleared: t.reconciliationId === session.id || t.status === "CLEARED",
          matchedJournalEntryId: t.matchedJournalEntryId,
          categorizedJournalEntryId: t.categorizedJournalEntryId,
        })),
      };
    }),

  /** Toggle a txn into or out of an in-progress session. */
  toggleClear: protectedProcedure
    .input(z.object({ sessionId: z.string(), bankTxnId: z.string(), include: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(ctx.auth.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      try {
        await toggleTransactionInSession({
          sessionId: input.sessionId,
          bankTxnId: input.bankTxnId,
          include: input.include,
        });
        return { ok: true };
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : "Failed.",
        });
      }
    }),

  /** Complete a reconciliation. */
  completeReconciliation: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(ctx.auth.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      try {
        const result = await completeReconciliation({
          sessionId: input.sessionId,
          userId: ctx.auth.user.id,
        });
        return result;
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : "Failed.",
        });
      }
    }),

  /** List reconciliation sessions for a bank account. */
  listReconciliations: protectedProcedure
    .input(z.object({ bankAccountId: z.string() }))
    .query(async ({ ctx, input }) => {
      const sessions = await db.reconciliationSession.findMany({
        where: { tenantId: ctx.auth.tenant.id, bankAccountId: input.bankAccountId },
        orderBy: { statementEndDate: "desc" },
      });
      return sessions.map((s) => ({
        id: s.id,
        statementStartDate: s.statementStartDate.toISOString(),
        statementEndDate: s.statementEndDate.toISOString(),
        statementStartDisplay: formatCents(s.statementStartBalanceCents),
        statementEndDisplay: formatCents(s.statementEndBalanceCents),
        clearedTotalDisplay: s.clearedTotalCents
          ? formatCents(s.clearedTotalCents)
          : "—",
        status: s.status,
        completedAt: s.completedAt?.toISOString() ?? null,
      }));
    }),
});
