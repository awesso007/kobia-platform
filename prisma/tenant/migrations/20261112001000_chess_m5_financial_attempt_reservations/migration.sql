CREATE TYPE "ChessFinancialAttemptStatus" AS ENUM (
  'RESERVED',
  'EXECUTING',
  'UNKNOWN',
  'COMMITTED',
  'FAILED',
  'CANCELLED'
);

CREATE TABLE "ChessFinancialAttempt" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "consentId" TEXT NOT NULL,
  "reviewId" TEXT NOT NULL,
  "legacyTenantId" TEXT NOT NULL,
  "legacyEntityId" TEXT NOT NULL,
  "legacyBankTransactionId" TEXT NOT NULL,
  "sourceDigest" TEXT NOT NULL,
  "sourceRefId" TEXT NOT NULL,
  "status" "ChessFinancialAttemptStatus" NOT NULL DEFAULT 'RESERVED',
  "createdByClerkUserId" TEXT NOT NULL,
  "journalEntryId" TEXT,
  "lastErrorCode" TEXT,
  "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "executionStartedAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChessFinancialAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ChessFinancialAttempt_consentId_fkey"
    FOREIGN KEY ("consentId") REFERENCES "ChessClientConsent"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ChessFinancialAttempt_sourceDigest_check"
    CHECK ("sourceDigest" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "ChessFinancialAttempt_sourceRef_check"
    CHECK ("sourceRefId" LIKE 'chess-bank-review:%'),
  CONSTRAINT "ChessFinancialAttempt_state_metadata_check"
    CHECK (
      ("status" <> 'EXECUTING' OR "executionStartedAt" IS NOT NULL) AND
      ("status" <> 'COMMITTED' OR ("journalEntryId" IS NOT NULL AND "resolvedAt" IS NOT NULL)) AND
      ("status" NOT IN ('FAILED', 'CANCELLED') OR "resolvedAt" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "ChessFinancialAttempt_sourceRefId_key"
  ON "ChessFinancialAttempt"("sourceRefId");
CREATE UNIQUE INDEX "ChessFinancialAttempt_reviewId_sourceDigest_key"
  ON "ChessFinancialAttempt"("reviewId", "sourceDigest");
CREATE INDEX "ChessFinancialAttempt_businessId_status_reservedAt_idx"
  ON "ChessFinancialAttempt"("businessId", "status", "reservedAt");
CREATE INDEX "ChessFinancialAttempt_consentId_status_idx"
  ON "ChessFinancialAttempt"("consentId", "status");

CREATE OR REPLACE FUNCTION "chess_financial_attempt_guard"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'CHESS financial attempt evidence is retained and cannot be deleted';
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id" OR
     NEW."businessId" IS DISTINCT FROM OLD."businessId" OR
     NEW."consentId" IS DISTINCT FROM OLD."consentId" OR
     NEW."reviewId" IS DISTINCT FROM OLD."reviewId" OR
     NEW."legacyTenantId" IS DISTINCT FROM OLD."legacyTenantId" OR
     NEW."legacyEntityId" IS DISTINCT FROM OLD."legacyEntityId" OR
     NEW."legacyBankTransactionId" IS DISTINCT FROM OLD."legacyBankTransactionId" OR
     NEW."sourceDigest" IS DISTINCT FROM OLD."sourceDigest" OR
     NEW."sourceRefId" IS DISTINCT FROM OLD."sourceRefId" OR
     NEW."createdByClerkUserId" IS DISTINCT FROM OLD."createdByClerkUserId" OR
     NEW."reservedAt" IS DISTINCT FROM OLD."reservedAt" OR
     NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'CHESS financial attempt source evidence is immutable';
  END IF;

  IF OLD."journalEntryId" IS NOT NULL AND
     NEW."journalEntryId" IS DISTINCT FROM OLD."journalEntryId" THEN
    RAISE EXCEPTION 'CHESS financial attempt journal receipt is immutable once pinned';
  END IF;

  IF OLD."executionStartedAt" IS NOT NULL AND
     NEW."executionStartedAt" IS DISTINCT FROM OLD."executionStartedAt" THEN
    RAISE EXCEPTION 'CHESS financial attempt execution timestamp is immutable once set';
  END IF;

  IF OLD."resolvedAt" IS NOT NULL AND
     NEW."resolvedAt" IS DISTINCT FROM OLD."resolvedAt" THEN
    RAISE EXCEPTION 'CHESS financial attempt resolution timestamp is immutable once set';
  END IF;

  IF NEW."status" IS DISTINCT FROM OLD."status" AND NOT (
    (OLD."status" = 'RESERVED' AND NEW."status" IN ('EXECUTING', 'CANCELLED')) OR
    (OLD."status" = 'EXECUTING' AND NEW."status" IN ('UNKNOWN', 'COMMITTED')) OR
    (OLD."status" = 'UNKNOWN' AND NEW."status" IN ('COMMITTED', 'FAILED'))
  ) THEN
    RAISE EXCEPTION 'Invalid CHESS financial attempt state transition: % -> %',
      OLD."status", NEW."status";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ChessFinancialAttempt_guard_update"
  BEFORE UPDATE ON "ChessFinancialAttempt"
  FOR EACH ROW EXECUTE FUNCTION "chess_financial_attempt_guard"();

CREATE TRIGGER "ChessFinancialAttempt_guard_delete"
  BEFORE DELETE ON "ChessFinancialAttempt"
  FOR EACH ROW EXECUTE FUNCTION "chess_financial_attempt_guard"();
