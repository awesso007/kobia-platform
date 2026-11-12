import type { Prisma } from "@/lib/db/generated/tenant";
import { PermissionError } from "@/lib/rbac/require-permission";

/**
 * Consent withdrawal and financial reservation both lock the same consent
 * row. RESERVED attempts are cancelled before withdrawal; EXECUTING and
 * UNKNOWN attempts block withdrawal until a separate reconciliation resolves
 * the legacy-ledger outcome.
 */
export async function guardAndCancelReservedFinancialAttempts(
  tx: Prisma.TransactionClient,
  consentId: string,
  now = new Date(),
  actorClerkUserId?: string,
) {
  await tx.$queryRaw<Array<{ id: string }>>\`SELECT "id" FROM "ChessClientConsent" WHERE "id" = \${consentId} FOR UPDATE\`;

  const consent = await tx.chessClientConsent.findUnique({
    where: { id: consentId },
    select: {
      id: true,
      businessId: true,
      status: true,
      acceptedByClerkUserId: true,
    },
  });
  if (!consent || consent.status !== "GRANTED" ||
      (actorClerkUserId && consent.acceptedByClerkUserId !== actorClerkUserId)) {
    throw new PermissionError("record:update");
  }

  const active = await tx.chessFinancialAttempt.findMany({
    where: {
      consentId,
      status: { in: ["RESERVED", "EXECUTING", "UNKNOWN"] },
    },
    select: { id: true, businessId: true, status: true },
  });

  // An in-flight or ambiguous cross-database write cannot be safely cancelled.
  if (active.some((attempt) => attempt.status === "EXECUTING" || attempt.status === "UNKNOWN")) {
    throw new PermissionError("record:update");
  }

  const reserved = active.filter((attempt) => attempt.status === "RESERVED");
  if (reserved.length) {
    await tx.chessFinancialAttempt.updateMany({
      where: {
        id: { in: reserved.map((attempt) => attempt.id) },
        status: "RESERVED",
      },
      data: {
        status: "CANCELLED",
        resolvedAt: now,
        lastErrorCode: "CONSENT_WITHDRAWN_BEFORE_EXECUTION",
      },
    });
    for (const attempt of reserved) {
      await tx.chessSecurityEvent.create({
        data: {
          businessId: attempt.businessId,
          actorClerkUserId: actorClerkUserId ?? null,
          action: "BANK_POSTING_RESERVATION_CANCELLED_BY_CONSENT_WITHDRAWAL",
          resourceType: "ChessFinancialAttempt",
          resourceId: attempt.id,
          decision: "ALLOW",
        },
      });
    }
  }

  return consent;
}
