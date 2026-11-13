import type { PrismaClient } from "@/lib/db/generated/tenant";
import { PermissionError } from "@/lib/rbac/require-permission";
import { isUsableConsent } from "./onboarding";

export type ChessFinancialAttemptState =
  | "RESERVED"
  | "EXECUTING"
  | "UNKNOWN"
  | "COMMITTED"
  | "FAILED"
  | "CANCELLED";

const transitions: Record<ChessFinancialAttemptState, readonly ChessFinancialAttemptState[]> = {
  RESERVED: ["EXECUTING", "CANCELLED"],
  EXECUTING: ["UNKNOWN", "COMMITTED"],
  UNKNOWN: ["COMMITTED", "FAILED"],
  COMMITTED: [],
  FAILED: [],
  CANCELLED: [],
};

export function financialAttemptTransitionAllowed(
  from: ChessFinancialAttemptState,
  to: ChessFinancialAttemptState,
): boolean {
  return from === to || transitions[from].includes(to);
}

export function financialAttemptBlocksConsentWithdrawal(
  status: ChessFinancialAttemptState,
): boolean {
  return status === "EXECUTING" || status === "UNKNOWN";
}

type ReserveInput = {
  businessId: string;
  consentId: string;
  reviewId: string;
  legacyTenantId: string;
  legacyEntityId: string;
  legacyBankTransactionId: string;
  sourceDigest: string;
  sourceRefId: string;
  createdByClerkUserId: string;
};

/**
 * Persist the tenant-side reservation before the legacy GL transaction.
 * The consent row lock is shared with consent withdrawal, preventing a
 * withdrawal/execution race inside the CHESS tenant database.
 */
export async function reserveChessBankPostingAttempt(
  db: PrismaClient,
  input: ReserveInput,
) {
  if (!/^[a-f0-9]{64}$/.test(input.sourceDigest) ||
      !input.sourceRefId.startsWith("chess-bank-review:")) {
    throw new PermissionError("record:update");
  }

  return db.$transaction(async (tx) => {
    await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "ChessClientConsent" WHERE "id" = ${input.consentId} FOR UPDATE`;

    const consent = await tx.chessClientConsent.findUnique({
      where: { id: input.consentId },
      select: {
        id: true,
        businessId: true,
        clientProfileId: true,
        purpose: true,
        status: true,
        expiresAt: true,
        consentedAt: true,
        acceptedByClerkUserId: true,
        verifiedEmailDigest: true,
        acceptanceEvidenceDigest: true,
        withdrawnAt: true,
      },
    });
    if (!consent || consent.businessId !== input.businessId ||
        !isUsableConsent(consent)) {
      throw new PermissionError("record:update");
    }

    const existing = await tx.chessFinancialAttempt.findUnique({
      where: { sourceRefId: input.sourceRefId },
    });
    if (existing) {
      if (existing.reviewId !== input.reviewId ||
          existing.consentId !== input.consentId ||
          existing.sourceDigest !== input.sourceDigest ||
          existing.legacyTenantId !== input.legacyTenantId ||
          existing.legacyEntityId !== input.legacyEntityId ||
          existing.legacyBankTransactionId !== input.legacyBankTransactionId) {
        throw new PermissionError("record:update");
      }
      return existing;
    }

    const sameReview = await tx.chessFinancialAttempt.findUnique({
      where: {
        reviewId_sourceDigest: {
          reviewId: input.reviewId,
          sourceDigest: input.sourceDigest,
        },
      },
    });
    if (sameReview) throw new PermissionError("record:update");

    const active = await tx.chessFinancialAttempt.findFirst({
      where: {
        consentId: input.consentId,
        status: { in: ["RESERVED", "EXECUTING", "UNKNOWN"] },
      },
      select: { id: true },
    });
    if (active) throw new PermissionError("record:update");

    const attempt = await tx.chessFinancialAttempt.create({
      data: {
        ...input,
        status: "RESERVED",
      },
    });
    await tx.chessSecurityEvent.create({
      data: {
        businessId: input.businessId,
        actorClerkUserId: input.createdByClerkUserId,
        action: "BANK_POSTING_ATTEMPT_RESERVED",
        resourceType: "ChessFinancialAttempt",
        resourceId: attempt.id,
        decision: "REVIEW",
      },
    });
    return attempt;
  }, { isolationLevel: "Serializable" });
}

/** Recheck consent under the same row lock immediately before the legacy write. */
export async function startChessBankPostingAttempt(
  db: PrismaClient,
  attemptId: string,
  actorClerkUserId: string,
): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const attempt = await tx.chessFinancialAttempt.findUnique({
      where: { id: attemptId },
      select: {
        id: true,
        businessId: true,
        consentId: true,
        createdByClerkUserId: true,
        status: true,
      },
    });
    if (!attempt || attempt.status !== "RESERVED" ||
        attempt.createdByClerkUserId !== actorClerkUserId) return false;

    await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "ChessClientConsent" WHERE "id" = ${attempt.consentId} FOR UPDATE`;
    const consent = await tx.chessClientConsent.findUnique({
      where: { id: attempt.consentId },
      select: {
        id: true,
        businessId: true,
        clientProfileId: true,
        purpose: true,
        status: true,
        expiresAt: true,
        consentedAt: true,
        acceptedByClerkUserId: true,
        verifiedEmailDigest: true,
        acceptanceEvidenceDigest: true,
        withdrawnAt: true,
      },
    });
    if (!consent || consent.businessId !== attempt.businessId ||
        !isUsableConsent(consent)) {
      const cancelled = await tx.chessFinancialAttempt.updateMany({
        where: { id: attempt.id, status: "RESERVED" },
        data: {
          status: "CANCELLED",
          resolvedAt: new Date(),
          lastErrorCode: "CONSENT_NOT_USABLE_AT_EXECUTION",
        },
      });
      if (cancelled.count) {
        await tx.chessSecurityEvent.create({
          data: {
            businessId: attempt.businessId,
            actorClerkUserId,
            action: "BANK_POSTING_ATTEMPT_CANCELLED_CONSENT_NOT_USABLE",
            resourceType: "ChessFinancialAttempt",
            resourceId: attempt.id,
            decision: "DENY",
          },
        });
      }
      return false;
    }

    const now = new Date();
    const changed = await tx.chessFinancialAttempt.updateMany({
      where: { id: attempt.id, status: "RESERVED" },
      data: { status: "EXECUTING", executionStartedAt: now },
    });
    if (!changed.count) return false;
    await tx.chessSecurityEvent.create({
      data: {
        businessId: attempt.businessId,
        actorClerkUserId,
        action: "BANK_POSTING_ATTEMPT_EXECUTING",
        resourceType: "ChessFinancialAttempt",
        resourceId: attempt.id,
        decision: "REVIEW",
      },
    });
    return true;
  }, { isolationLevel: "Serializable" });
}

/** A lost/ambiguous legacy commit acknowledgement is UNKNOWN, never retried automatically. */
export async function markChessBankPostingAttemptUnknown(
  db: PrismaClient,
  attemptId: string,
  actorClerkUserId: string,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const attempt = await tx.chessFinancialAttempt.findUnique({
      where: { id: attemptId },
      select: { id: true, businessId: true, status: true },
    });
    if (!attempt || attempt.status !== "EXECUTING") return;
    const changed = await tx.chessFinancialAttempt.updateMany({
      where: { id: attemptId, status: "EXECUTING" },
      data: {
        status: "UNKNOWN",
        lastErrorCode: "LEGACY_COMMIT_OUTCOME_UNCONFIRMED",
      },
    });
    if (changed.count) {
      await tx.chessSecurityEvent.create({
        data: {
          businessId: attempt.businessId,
          actorClerkUserId,
          action: "BANK_POSTING_ATTEMPT_OUTCOME_UNKNOWN",
          resourceType: "ChessFinancialAttempt",
          resourceId: attempt.id,
          decision: "REVIEW",
        },
      });
    }
  }, { isolationLevel: "Serializable" });
}

/** Pin the verified legacy journal receipt; the receipt cannot later be changed. */
export async function markChessBankPostingAttemptCommitted(
  db: PrismaClient,
  attemptId: string,
  actorClerkUserId: string,
  journalEntryId: string,
): Promise<boolean> {
  if (!journalEntryId) return false;
  return db.$transaction(async (tx) => {
    const attempt = await tx.chessFinancialAttempt.findUnique({
      where: { id: attemptId },
      select: { id: true, businessId: true, status: true, journalEntryId: true },
    });
    if (!attempt) return false;
    if (attempt.status === "COMMITTED") {
      return attempt.journalEntryId === journalEntryId;
    }
    if (attempt.status !== "EXECUTING" && attempt.status !== "UNKNOWN") return false;

    const changed = await tx.chessFinancialAttempt.updateMany({
      where: {
        id: attemptId,
        status: { in: ["EXECUTING", "UNKNOWN"] },
      },
      data: {
        status: "COMMITTED",
        journalEntryId,
        resolvedAt: new Date(),
        lastErrorCode: null,
      },
    });
    if (!changed.count) return false;
    await tx.chessSecurityEvent.create({
      data: {
        businessId: attempt.businessId,
        actorClerkUserId,
        action: "BANK_POSTING_ATTEMPT_COMMITTED",
        resourceType: "ChessFinancialAttempt",
        resourceId: attempt.id,
        decision: "ALLOW",
      },
    });
    return true;
  }, { isolationLevel: "Serializable" });
}
