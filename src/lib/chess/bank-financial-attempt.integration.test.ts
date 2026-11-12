import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/lib/db/generated/tenant";
import {
  markChessBankPostingAttemptCommitted,
  markChessBankPostingAttemptUnknown,
  reserveChessBankPostingAttempt,
  startChessBankPostingAttempt,
} from "./bank-financial-attempt";
import { guardAndCancelReservedFinancialAttempts } from "./financial-attempt-guard";

const integration = process.env.RUN_CHESS_DB_INTEGRATION === "1" ? describe : describe.skip;

integration("CHESS durable cross-database bank posting reservation", () => {
  let db: PrismaClient;

  beforeAll(async () => {
    db = new PrismaClient();
    await db.$connect();
  });

  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  async function grantedConsent(suffix: string) {
    const consent = await db.chessClientConsent.create({
      data: {
        businessId: "financial-attempt-business-" + suffix,
        clientProfileId: "financial-attempt-client-" + suffix,
        purpose: "service:BOOKKEEPING",
        policyVersion: "financial-attempt-test-v1",
        policyText: "Fictional financial-attempt consent evidence for isolated PostgreSQL integration tests only.",
      },
    });
    return db.chessClientConsent.update({
      where: { id: consent.id },
      data: {
        status: "GRANTED",
        consentedAt: new Date(Date.now() - 1000),
        acceptedByClerkUserId: "financial-attempt-client-user-" + suffix,
        verifiedEmailDigest: "a".repeat(64),
        acceptanceEvidenceDigest: "b".repeat(64),
      },
    });
  }

  function reservation(consentId: string, suffix: string) {
    return {
      businessId: "financial-attempt-business-" + suffix,
      consentId,
      reviewId: "financial-attempt-review-" + suffix,
      legacyTenantId: "legacy-tenant-" + suffix,
      legacyEntityId: "legacy-entity-" + suffix,
      legacyBankTransactionId: "legacy-bank-transaction-" + suffix,
      sourceDigest: "c".repeat(64),
      sourceRefId: "chess-bank-review:financial-attempt-" + suffix,
      createdByClerkUserId: "financial-attempt-executor-" + suffix,
    };
  }

  it("cancels a RESERVED attempt before allowing consent withdrawal", async () => {
    const suffix = Date.now().toString(36) + "-reserved";
    const consent = await grantedConsent(suffix);
    const attempt = await reserveChessBankPostingAttempt(
      db,
      reservation(consent.id, suffix),
    );
    expect(attempt.status).toBe("RESERVED");

    await db.$transaction(async (tx) => {
      await guardAndCancelReservedFinancialAttempts(
        tx,
        consent.id,
        new Date(),
        consent.acceptedByClerkUserId!,
      );
      await tx.chessClientConsent.update({
        where: { id: consent.id },
        data: { status: "WITHDRAWN", withdrawnAt: new Date() },
      });
    }, { isolationLevel: "Serializable" });

    expect((await db.chessFinancialAttempt.findUnique({
      where: { id: attempt.id },
    }))?.status).toBe("CANCELLED");
    expect((await db.chessClientConsent.findUnique({
      where: { id: consent.id },
    }))?.status).toBe("WITHDRAWN");
  });

  it("blocks withdrawal during EXECUTING and UNKNOWN, then permits it after a pinned journal receipt", async () => {
    const suffix = Date.now().toString(36) + "-unknown";
    const consent = await grantedConsent(suffix);
    const attempt = await reserveChessBankPostingAttempt(
      db,
      reservation(consent.id, suffix),
    );

    expect(await startChessBankPostingAttempt(
      db,
      attempt.id,
      attempt.createdByClerkUserId,
    )).toBe(true);

    await expect(db.$transaction(async (tx) => {
      await guardAndCancelReservedFinancialAttempts(
        tx,
        consent.id,
        new Date(),
        consent.acceptedByClerkUserId!,
      );
    }, { isolationLevel: "Serializable" })).rejects.toThrow();

    expect((await db.chessClientConsent.findUnique({
      where: { id: consent.id },
    }))?.status).toBe("GRANTED");

    await markChessBankPostingAttemptUnknown(
      db,
      attempt.id,
      attempt.createdByClerkUserId,
    );
    expect((await db.chessFinancialAttempt.findUnique({
      where: { id: attempt.id },
    }))?.status).toBe("UNKNOWN");

    await expect(db.$transaction(async (tx) => {
      await guardAndCancelReservedFinancialAttempts(
        tx,
        consent.id,
        new Date(),
        consent.acceptedByClerkUserId!,
      );
    }, { isolationLevel: "Serializable" })).rejects.toThrow();

    expect(await markChessBankPostingAttemptCommitted(
      db,
      attempt.id,
      attempt.createdByClerkUserId,
      "fictional-legacy-journal-" + suffix,
    )).toBe(true);

    await db.$transaction(async (tx) => {
      await guardAndCancelReservedFinancialAttempts(
        tx,
        consent.id,
        new Date(),
        consent.acceptedByClerkUserId!,
      );
      await tx.chessClientConsent.update({
        where: { id: consent.id },
        data: { status: "WITHDRAWN", withdrawnAt: new Date() },
      });
    }, { isolationLevel: "Serializable" });

    const finalAttempt = await db.chessFinancialAttempt.findUnique({
      where: { id: attempt.id },
    });
    expect(finalAttempt?.status).toBe("COMMITTED");
    expect(finalAttempt?.journalEntryId).toBe("fictional-legacy-journal-" + suffix);
    expect((await db.chessClientConsent.findUnique({
      where: { id: consent.id },
    }))?.status).toBe("WITHDRAWN");
  });

  it("never cancels another business reservation on a mismatched admin request", async () => {
    const suffix = Date.now().toString(36) + "-foreign";
    const consent = await grantedConsent(suffix);
    const attempt = await reserveChessBankPostingAttempt(
      db,
      reservation(consent.id, suffix),
    );
    await expect(db.$transaction(async (tx) => {
      await guardAndCancelReservedFinancialAttempts(
        tx,
        consent.id,
        new Date(),
        undefined,
        "unrelated-business",
      );
    }, { isolationLevel: "Serializable" })).rejects.toThrow();
    const remaining = await db.chessFinancialAttempt.findUnique({
      where: { id: attempt.id },
    });
    expect(remaining?.status).toBe("RESERVED");
    expect((await db.chessClientConsent.findUnique({
      where: { id: consent.id },
    }))?.status).toBe("GRANTED");
  });

  it("pins source evidence and rejects edits or deletion at the database layer", async () => {
    const suffix = Date.now().toString(36) + "-immutable";
    const consent = await grantedConsent(suffix);
    const attempt = await reserveChessBankPostingAttempt(
      db,
      reservation(consent.id, suffix),
    );
    await expect(db.chessFinancialAttempt.update({
      where: { id: attempt.id },
      data: { sourceDigest: "d".repeat(64) },
    })).rejects.toThrow();
    await expect(db.chessFinancialAttempt.delete({
      where: { id: attempt.id },
    })).rejects.toThrow();
  });
});
