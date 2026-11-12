-- Round 39: CHESS client document revision + disposal lifecycle.
-- Existing metadata is preserved, no data deletion, no release flag activation.
-- Apply only on isolated backed-up tenant schemas with migration role separated
-- from the runtime role. This migration NEVER purges stored objects.

CREATE TYPE "ChessDocumentRevisionKind" AS ENUM ('ORIGINAL','REPLACEMENT','REDACTED');
CREATE TYPE "ChessDocumentDisposalStatus" AS ENUM
 ('REQUESTED','APPROVED','EXECUTING','UNKNOWN','PURGED','REJECTED');

ALTER TABLE "ChessClientDocument"
 ADD COLUMN "replacesDocumentId" TEXT,
 ADD COLUMN "revisionNumber" INTEGER NOT NULL DEFAULT 1,
 ADD COLUMN "revisionKind" "ChessDocumentRevisionKind" NOT NULL DEFAULT 'ORIGINAL',
 ADD COLUMN "redactionApprovedByClerkUserId" TEXT,
 ADD COLUMN "redactionApprovedAt" TIMESTAMP(3),
 ADD COLUMN "supersededAt" TIMESTAMP(3),
 ADD COLUMN "purgedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "ChessClientDocument_replacesDocumentId_key"
 ON "ChessClientDocument"("replacesDocumentId");
CREATE INDEX "ChessClientDocument_replacesDocumentId_revisionNumber_idx"
 ON "ChessClientDocument"("replacesDocumentId","revisionNumber");
CREATE INDEX "ChessClientDocument_businessId_purgedAt_supersededAt_idx"
 ON "ChessClientDocument"("businessId","purgedAt","supersededAt");

CREATE TABLE "ChessDocumentDisposal" (
 "id" TEXT NOT NULL,
 "documentId" TEXT NOT NULL,
 "businessId" TEXT NOT NULL,
 "status" "ChessDocumentDisposalStatus" NOT NULL DEFAULT 'REQUESTED',
 "requestedByClerkUserId" TEXT NOT NULL,
 "approvedByClerkUserId" TEXT,
 "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "approvedAt" TIMESTAMP(3),
 "executionStartedAt" TIMESTAMP(3),
 "completedAt" TIMESTAMP(3),
 "receiptDigest" TEXT,
 "lastErrorCode" TEXT,
 CONSTRAINT "ChessDocumentDisposal_pkey" PRIMARY KEY("id"),
 CONSTRAINT "ChessDocumentDisposal_documentId_fkey" FOREIGN KEY("documentId")
 REFERENCES "ChessClientDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ChessDocumentDisposal_documentId_key"
 ON "ChessDocumentDisposal"("documentId");
CREATE INDEX "ChessDocumentDisposal_businessId_status_requestedAt_idx"
 ON "ChessDocumentDisposal"("businessId","status","requestedAt");

-- Supplement the original M3 lifecycle trigger with write-once provenance and
-- terminal purge controls. The original trigger continues to forbid metadata DELETE,
-- silent legal-hold release, retention rewrites and unsuppression.
CREATE FUNCTION chess_document_revision_and_disposal_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE predecessor RECORD;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW."revisionKind"='ORIGINAL' THEN
   IF NEW."replacesDocumentId" IS NOT NULL OR NEW."revisionNumber"<>1 THEN
    RAISE EXCEPTION 'Original document must begin revision 1';
   END IF;
  ELSE
   IF NEW."replacesDocumentId" IS NULL OR NEW."revisionNumber"<=1 THEN
    RAISE EXCEPTION 'Replacement requires a predecessor';
   END IF;
   SELECT "businessId","clientProfileId","service","revisionNumber",
    "status","purgedAt","supersededAt","retentionUntil","legalHoldAt"
    INTO predecessor FROM "ChessClientDocument"
    WHERE "id"=NEW."replacesDocumentId" FOR UPDATE;
   IF NOT FOUND OR predecessor."businessId"<>NEW."businessId" OR
     predecessor."clientProfileId"<>NEW."clientProfileId" OR
     predecessor."service"<>NEW."service" OR
     predecessor."revisionNumber"+1<>NEW."revisionNumber" OR
     predecessor."status"<>'READY' OR predecessor."purgedAt" IS NOT NULL OR
     predecessor."supersededAt" IS NOT NULL THEN
    RAISE EXCEPTION 'Document revision scope or predecessor invalid';
   END IF;
  END IF;
  IF NEW."redactionApprovedAt" IS NOT NULL OR
     NEW."redactionApprovedByClerkUserId" IS NOT NULL OR
     NEW."supersededAt" IS NOT NULL OR NEW."purgedAt" IS NOT NULL THEN
   RAISE EXCEPTION 'Document lifecycle provenance must start empty';
  END IF;
  RETURN NEW;
 END IF;
 IF NEW."businessId" IS DISTINCT FROM OLD."businessId" OR
    NEW."clientProfileId" IS DISTINCT FROM OLD."clientProfileId" OR
    NEW."service" IS DISTINCT FROM OLD."service" OR
    NEW."storageKey" IS DISTINCT FROM OLD."storageKey" OR
    NEW."replacesDocumentId" IS DISTINCT FROM OLD."replacesDocumentId" OR
    NEW."revisionKind" IS DISTINCT FROM OLD."revisionKind" OR
    NEW."revisionNumber" IS DISTINCT FROM OLD."revisionNumber" OR
    NEW."uploadedByClerkUserId" IS DISTINCT FROM OLD."uploadedByClerkUserId" THEN
   RAISE EXCEPTION 'Document provenance cannot be rewritten';
 END IF;
 IF OLD."redactionApprovedAt" IS NOT NULL AND (
    NEW."redactionApprovedAt" IS DISTINCT FROM OLD."redactionApprovedAt" OR
    NEW."redactionApprovedByClerkUserId" IS DISTINCT FROM OLD."redactionApprovedByClerkUserId") THEN
   RAISE EXCEPTION 'Document redaction approval is write once';
 END IF;
 IF (NEW."redactionApprovedAt" IS NULL) <>
    (NEW."redactionApprovedByClerkUserId" IS NULL) THEN
   RAISE EXCEPTION 'Redaction approval needs independent actor and time';
 END IF;
 IF NEW."revisionKind"='REDACTED' AND NEW."status"='READY' AND
    (NEW."redactionApprovedAt" IS NULL OR NEW."verifiedAt" IS NULL OR
     NEW."checksumSha256" IS NULL) THEN
   RAISE EXCEPTION 'Redacted version requires review and verified bytes';
 END IF;
 IF OLD."supersededAt" IS NOT NULL AND
    NEW."supersededAt" IS DISTINCT FROM OLD."supersededAt" THEN
   RAISE EXCEPTION 'Document supersession is permanent';
 END IF;
 IF OLD."purgedAt" IS NOT NULL AND
    NEW."purgedAt" IS DISTINCT FROM OLD."purgedAt" THEN
   RAISE EXCEPTION 'Document disposal is permanent';
 END IF;
 IF OLD."purgedAt" IS NOT NULL AND (NEW."storageKey" IS DISTINCT FROM OLD."storageKey" OR
    NEW."status" IS DISTINCT FROM OLD."status") THEN
   RAISE EXCEPTION 'Purged document may not be reactivated';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER chess_document_revision_disposal_guard
 BEFORE INSERT OR UPDATE ON "ChessClientDocument"
 FOR EACH ROW EXECUTE FUNCTION chess_document_revision_and_disposal_guard();

-- Disposal is append-only in outcome: no DELETE, no requester swap or
-- release back to APPROVED following UNKNOWN. Explicit independent review is
-- required before the worker can claim an APPROVED disposal record.
CREATE FUNCTION chess_document_disposal_immutability()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'Document disposal audit records cannot be deleted';
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW."status"<>'REQUESTED' OR NEW."approvedByClerkUserId" IS NOT NULL
     OR NEW."completedAt" IS NOT NULL OR NEW."receiptDigest" IS NOT NULL THEN
   RAISE EXCEPTION 'Disposal must begin as a request';
  END IF;
  RETURN NEW;
 END IF;
 IF NEW."documentId" IS DISTINCT FROM OLD."documentId" OR
    NEW."businessId" IS DISTINCT FROM OLD."businessId" OR
    NEW."requestedByClerkUserId" IS DISTINCT FROM OLD."requestedByClerkUserId" OR
    NEW."requestedAt" IS DISTINCT FROM OLD."requestedAt" THEN
   RAISE EXCEPTION 'Document disposal identity is immutable';
 END IF;
 IF OLD."status"='PURGED' OR OLD."status"='REJECTED' THEN
  RAISE EXCEPTION 'Terminal disposal state is immutable';
 END IF;
 IF OLD."status"='REQUESTED' AND NEW."status" NOT IN ('REQUESTED','APPROVED','REJECTED') OR
    OLD."status"='APPROVED' AND NEW."status" NOT IN ('APPROVED','EXECUTING') OR
    OLD."status"='EXECUTING' AND NEW."status" NOT IN ('EXECUTING','UNKNOWN','PURGED') OR
    OLD."status"='UNKNOWN' AND NEW."status" NOT IN ('UNKNOWN','PURGED') THEN
  RAISE EXCEPTION 'Invalid document disposal transition';
 END IF;
 IF NEW."status" IN ('APPROVED','EXECUTING','UNKNOWN','PURGED') AND (
    NEW."approvedAt" IS NULL OR NEW."approvedByClerkUserId" IS NULL OR
    NEW."approvedByClerkUserId"=NEW."requestedByClerkUserId") THEN
   RAISE EXCEPTION 'Disposal requires distinct independent approval';
 END IF;
 IF OLD."approvedAt" IS NOT NULL AND (
    OLD."approvedAt" IS DISTINCT FROM NEW."approvedAt" OR
    OLD."approvedByClerkUserId" IS DISTINCT FROM NEW."approvedByClerkUserId") THEN
   RAISE EXCEPTION 'Disposal approval is immutable';
 END IF;
 IF NEW."status"='PURGED' AND (
    NEW."receiptDigest" IS NULL OR NEW."completedAt" IS NULL) THEN
   RAISE EXCEPTION 'Purged object requires a durable receipt';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER chess_document_disposal_guard
 BEFORE INSERT OR UPDATE OR DELETE ON "ChessDocumentDisposal"
 FOR EACH ROW EXECUTE FUNCTION chess_document_disposal_immutability();
