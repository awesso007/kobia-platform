-- M3: fail-closed document lifecycle metadata for live release.
-- Applied only after backed-up tenant migration and external retention/legal
-- policy approval. Runtime DB role MUST NOT own schema or alter triggers.
ALTER TABLE "ChessClientDocument"
 ADD COLUMN "retentionUntil" TIMESTAMP(3),
 ADD COLUMN "legalHoldAt" TIMESTAMP(3),
 ADD COLUMN "legalHoldByClerkUserId" TEXT,
 ADD COLUMN "suppressedAt" TIMESTAMP(3),
 ADD COLUMN "suppressedByClerkUserId" TEXT;
CREATE INDEX "ChessClientDocument_businessId_retentionUntil_suppressedAt_idx"
 ON "ChessClientDocument"("businessId","retentionUntil","suppressedAt");

CREATE FUNCTION chess_document_lifecycle_write_once()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'CHESS document metadata deletion requires a separately approved retention workflow';
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW."retentionUntil" IS NOT NULL OR NEW."legalHoldAt" IS NOT NULL OR
     NEW."legalHoldByClerkUserId" IS NOT NULL OR NEW."suppressedAt" IS NOT NULL OR
     NEW."suppressedByClerkUserId" IS NOT NULL THEN
   RAISE EXCEPTION 'CHESS lifecycle metadata must be initialized by an audited transition';
  END IF;
  RETURN NEW;
 END IF;
 IF OLD."retentionUntil" IS NOT NULL AND
    OLD."retentionUntil" IS DISTINCT FROM NEW."retentionUntil" THEN
  RAISE EXCEPTION 'CHESS retention date is write once';
 END IF;
 IF NEW."retentionUntil" IS NOT NULL AND
    NEW."retentionUntil" <= OLD."createdAt" THEN
  RAISE EXCEPTION 'CHESS retention cannot end before document creation';
 END IF;
 IF OLD."legalHoldAt" IS NOT NULL AND (
    OLD."legalHoldAt" IS DISTINCT FROM NEW."legalHoldAt" OR
    OLD."legalHoldByClerkUserId" IS DISTINCT FROM NEW."legalHoldByClerkUserId") THEN
  RAISE EXCEPTION 'CHESS legal hold cannot be silently released or rewritten';
 END IF;
 IF (NEW."legalHoldAt" IS NULL) <> (NEW."legalHoldByClerkUserId" IS NULL) THEN
  RAISE EXCEPTION 'CHESS legal hold requires a recorded actor and timestamp';
 END IF;
 IF OLD."suppressedAt" IS NOT NULL AND (
    OLD."suppressedAt" IS DISTINCT FROM NEW."suppressedAt" OR
    OLD."suppressedByClerkUserId" IS DISTINCT FROM NEW."suppressedByClerkUserId") THEN
  RAISE EXCEPTION 'CHESS document download suppression cannot be undone';
 END IF;
 IF (NEW."suppressedAt" IS NULL) <> (NEW."suppressedByClerkUserId" IS NULL) THEN
  RAISE EXCEPTION 'CHESS download suppression requires recorded actor and timestamp';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER chess_document_lifecycle_immutable
 BEFORE INSERT OR UPDATE OR DELETE ON "ChessClientDocument"
 FOR EACH ROW EXECUTE FUNCTION chess_document_lifecycle_write_once();
