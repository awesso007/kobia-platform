-- Round 45: Preserve parent lifecycle restrictions across every replacement
-- or redacted revision. All changes remain within one tenant transaction.
-- No object deletion and no external policy activation occurs here.
-- The existing BEFORE INSERT lifecycle guard requires NULL lifecycle fields
-- on new rows, so inheritance is applied atomically by an AFTER INSERT update.

CREATE FUNCTION chess_document_lineage_propagate()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent RECORD;
BEGIN
 IF TG_OP = 'INSERT' THEN
  IF NEW."replacesDocumentId" IS NULL THEN RETURN NEW; END IF;
  SELECT "retentionUntil", "legalHoldAt","legalHoldByClerkUserId",
         "suppressedAt","suppressedByClerkUserId"
   INTO parent FROM "ChessClientDocument"
   WHERE "id"=NEW."replacesDocumentId" FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Document predecessor missing'; END IF;
  -- A parent's retention horizon cannot end before this new child existed.
  IF parent."retentionUntil" IS NOT NULL AND
     parent."retentionUntil" <= NEW."createdAt" THEN
   RAISE EXCEPTION 'Cannot bypass or inherit expired parent retention';
  END IF;
  UPDATE "ChessClientDocument" SET
   "retentionUntil"=parent."retentionUntil",
   "legalHoldAt"=parent."legalHoldAt",
   "legalHoldByClerkUserId"=parent."legalHoldByClerkUserId",
   "suppressedAt"=parent."suppressedAt",
   "suppressedByClerkUserId"=parent."suppressedByClerkUserId"
  WHERE "id"=NEW."id" AND
   (parent."retentionUntil" IS NOT NULL OR
    parent."legalHoldAt" IS NOT NULL OR
    parent."suppressedAt" IS NOT NULL);
  RETURN NEW;
 END IF;

 IF TG_OP = 'UPDATE' THEN
  IF NEW."retentionUntil" IS NOT DISTINCT FROM OLD."retentionUntil" AND
     NEW."legalHoldAt" IS NOT DISTINCT FROM OLD."legalHoldAt" AND
     NEW."suppressedAt" IS NOT DISTINCT FROM OLD."suppressedAt" THEN
   RETURN NEW;
  END IF;
  -- Fail the entire policy transition if a later child has a narrower
  -- independent retention, or is newer than the proposed parent expiry.
  IF NEW."retentionUntil" IS NOT NULL AND EXISTS (
   SELECT 1 FROM "ChessClientDocument" c
    WHERE c."replacesDocumentId"=NEW."id"
      AND ((c."retentionUntil" IS NOT NULL AND
            c."retentionUntil"<NEW."retentionUntil") OR
           (c."retentionUntil" IS NULL AND
            c."createdAt">=NEW."retentionUntil"))
  ) THEN
   RAISE EXCEPTION 'Retention cannot shorten a document revision chain';
  END IF;
  -- Only ADD previously missing legal protection; never remove/shorten.
  -- Each child UPDATE fires this trigger again for deeper descendants.
  UPDATE "ChessClientDocument" AS child SET
   "retentionUntil"=COALESCE(child."retentionUntil",NEW."retentionUntil"),
   "legalHoldAt"=COALESCE(child."legalHoldAt",NEW."legalHoldAt"),
   "legalHoldByClerkUserId"=COALESCE(
     child."legalHoldByClerkUserId",NEW."legalHoldByClerkUserId"),
   "suppressedAt"=COALESCE(child."suppressedAt",NEW."suppressedAt"),
   "suppressedByClerkUserId"=COALESCE(
     child."suppressedByClerkUserId",NEW."suppressedByClerkUserId")
  WHERE child."replacesDocumentId"=NEW."id" AND (
   (child."retentionUntil" IS NULL AND NEW."retentionUntil" IS NOT NULL) OR
   (child."legalHoldAt" IS NULL AND NEW."legalHoldAt" IS NOT NULL) OR
   (child."suppressedAt" IS NULL AND NEW."suppressedAt" IS NOT NULL));
 END IF;
 RETURN NEW;
END;
$$;

CREATE TRIGGER chess_document_revision_inherit_on_insert
 AFTER INSERT ON "ChessClientDocument"
 FOR EACH ROW EXECUTE FUNCTION chess_document_lineage_propagate();

CREATE TRIGGER chess_document_revision_protect_on_update
 AFTER UPDATE OF "retentionUntil","legalHoldAt","suppressedAt"
 ON "ChessClientDocument"
 FOR EACH ROW EXECUTE FUNCTION chess_document_lineage_propagate();
