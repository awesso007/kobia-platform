-- M5: two separate human requests must never create two source-bound
-- authorizations for the same business and posted-run fingerprint.
-- Pre-existing collisions intentionally abort migration for a supervised
-- legal/finance inventory; do NOT silently remove signed decisions.
DO $$
BEGIN
 IF EXISTS(
  SELECT 1 FROM "ChessActionApproval"
  WHERE "actionType"='PAYROLL_EXECUTE'
  GROUP BY "businessId","payloadDigest" HAVING count(*)>1
 ) THEN
  RAISE EXCEPTION 'Duplicate payroll approval fingerprints: supervised reconciliation required before migration';
 END IF;
END $$;
CREATE UNIQUE INDEX "ChessActionApproval_payroll_source_once"
 ON "ChessActionApproval"("businessId","payloadDigest")
 WHERE "actionType"='PAYROLL_EXECUTE';
