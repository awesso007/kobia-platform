-- M7 historical operational period snapshot. No journal or financial close.
-- Admin/owner must be separately approved before deploying to each tenant.
CREATE TABLE "ChessOperationalPeriodSnapshot" (
 "id" TEXT NOT NULL,
 "businessId" TEXT NOT NULL,
 "month" TEXT NOT NULL,
 "reportJson" TEXT NOT NULL,
 "sourceDigest" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING',
 "createdByClerkUserId" TEXT NOT NULL,
 "reviewedByClerkUserId" TEXT,
 "reviewedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ChessOperationalPeriodSnapshot_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "ChessOperationalPeriodSnapshot_businessId_month_key"
  UNIQUE ("businessId","month")
);
CREATE INDEX "ChessOperationalPeriodSnapshot_businessId_status_createdAt_idx"
 ON "ChessOperationalPeriodSnapshot"("businessId","status","createdAt");

CREATE FUNCTION chess_reject_operational_snapshot_tampering()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'Operational snapshots are immutable and cannot be deleted';
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW."status"<>'PENDING' OR NEW."reviewedByClerkUserId" IS NOT NULL OR
     NEW."reviewedAt" IS NOT NULL OR length(NEW."reportJson")>65536 OR
     length(NEW."reportJson")<2 OR
     NEW."sourceDigest" !~ '^[a-f0-9]{64}$' OR
     NEW."month" !~ '^20[2-9][0-9]-(0[1-9]|1[0-2])$' OR
     NEW."createdByClerkUserId"='' THEN
   RAISE EXCEPTION 'Operational snapshot insert not authorized by schema policy';
  END IF;
  RETURN NEW;
 END IF;
 IF OLD."id" IS DISTINCT FROM NEW."id" OR
    OLD."businessId" IS DISTINCT FROM NEW."businessId" OR
    OLD."month" IS DISTINCT FROM NEW."month" OR
    OLD."reportJson" IS DISTINCT FROM NEW."reportJson" OR
    OLD."sourceDigest" IS DISTINCT FROM NEW."sourceDigest" OR
    OLD."createdByClerkUserId" IS DISTINCT FROM NEW."createdByClerkUserId" OR
    OLD."createdAt" IS DISTINCT FROM NEW."createdAt" THEN
  RAISE EXCEPTION 'Operational snapshot evidence may not change';
 END IF;
 IF OLD."status"<>'PENDING' OR NEW."status"<>'APPROVED' OR
    NULLIF(NEW."reviewedByClerkUserId",'') IS NULL OR
    NEW."reviewedByClerkUserId"=OLD."createdByClerkUserId" OR
    NEW."reviewedAt" IS NULL OR
    NEW."reviewedAt"<OLD."createdAt" THEN
  RAISE EXCEPTION 'Operational snapshot requires distinct reviewer and one-way approval';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER chess_operational_snapshot_immutable
BEFORE INSERT OR UPDATE OR DELETE ON "ChessOperationalPeriodSnapshot"
FOR EACH ROW EXECUTE FUNCTION chess_reject_operational_snapshot_tampering();
