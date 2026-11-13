-- Round 11: preserve source policy and verified consent provenance at
-- PostgreSQL level. A new version must be issued as a NEW consent row.
-- Database owners can disable triggers: restrict the runtime application
-- database role from schema/trigger ownership and ALTER TABLE permissions.
-- Existing recorded grants are deliberately not backfilled or trusted:
-- revoke/reissue any legacy row missing valid acceptance evidence.
CREATE FUNCTION chess_reject_consent_evidence_tampering()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN
  RAISE EXCEPTION 'CHESS consent records may not be deleted';
 END IF;

 IF TG_OP = 'INSERT' THEN
  IF NEW."status" <> 'PENDING' OR NEW."consentedAt" IS NOT NULL OR
     NEW."acceptedByClerkUserId" IS NOT NULL OR
     NEW."verifiedEmailDigest" IS NOT NULL OR
     NEW."acceptanceEvidenceDigest" IS NOT NULL OR
     NEW."withdrawnAt" IS NOT NULL THEN
    RAISE EXCEPTION 'CHESS consent must start pending without evidence';
  END IF;
  RETURN NEW;
 END IF;

 -- The subject, scope, exact policy snapshot and signed provenance can
 -- never be mutated in place, regardless of the visible status.
 IF OLD."id" IS DISTINCT FROM NEW."id" OR
    OLD."clientProfileId" IS DISTINCT FROM NEW."clientProfileId" OR
    OLD."businessId" IS DISTINCT FROM NEW."businessId" OR
    OLD."purpose" IS DISTINCT FROM NEW."purpose" OR
    OLD."policyVersion" IS DISTINCT FROM NEW."policyVersion" OR
    OLD."policyText" IS DISTINCT FROM NEW."policyText" OR
    OLD."expiresAt" IS DISTINCT FROM NEW."expiresAt" OR
    OLD."createdAt" IS DISTINCT FROM NEW."createdAt" THEN
   RAISE EXCEPTION 'CHESS consent policy and identity are immutable';
 END IF;
 IF OLD."status" IN ('WITHDRAWN','EXPIRED') THEN
   RAISE EXCEPTION 'Terminal CHESS consent may not be changed';
 END IF;
 IF NEW."status" = OLD."status" OR
    (OLD."status" = 'PENDING' AND NEW."status" NOT IN ('GRANTED','EXPIRED')) OR
    (OLD."status" = 'GRANTED' AND NEW."status" NOT IN ('WITHDRAWN','EXPIRED')) THEN
   RAISE EXCEPTION 'Invalid CHESS consent state transition';
 END IF;
 IF OLD."status" = 'GRANTED' AND
   (OLD."consentedAt" IS DISTINCT FROM NEW."consentedAt" OR
    OLD."acceptedByClerkUserId" IS DISTINCT FROM NEW."acceptedByClerkUserId" OR
    OLD."verifiedEmailDigest" IS DISTINCT FROM NEW."verifiedEmailDigest" OR
    OLD."acceptanceEvidenceDigest" IS DISTINCT FROM NEW."acceptanceEvidenceDigest") THEN
   RAISE EXCEPTION 'CHESS acceptance proof may not be altered';
 END IF;
 IF NEW."status" = 'GRANTED' THEN
  IF length(NEW."policyText") < 50 OR
     NEW."consentedAt" IS NULL OR
     NEW."consentedAt" > CURRENT_TIMESTAMP OR
     NULLIF(NEW."acceptedByClerkUserId",'') IS NULL OR
     NEW."verifiedEmailDigest" IS NULL OR
     NEW."verifiedEmailDigest" !~ '^[0-9a-f]{64}$' OR
     NEW."acceptanceEvidenceDigest" IS NULL OR
     NEW."acceptanceEvidenceDigest" !~ '^[0-9a-f]{64}$' OR
     (NEW."expiresAt" IS NOT NULL AND NEW."expiresAt" <= CURRENT_TIMESTAMP) OR
     NEW."withdrawnAt" IS NOT NULL THEN
    RAISE EXCEPTION 'CHESS consent grant missing valid evidence metadata';
  END IF;
 ELSIF NEW."status" = 'WITHDRAWN' THEN
  IF OLD."status" <> 'GRANTED' OR NEW."withdrawnAt" IS NULL OR
     NEW."withdrawnAt" < OLD."consentedAt" THEN
   RAISE EXCEPTION 'CHESS consent withdrawal requires existing proof';
  END IF;
 ELSIF NEW."status" = 'EXPIRED' THEN
  IF NEW."consentedAt" IS DISTINCT FROM OLD."consentedAt" OR
     NEW."acceptedByClerkUserId" IS DISTINCT FROM OLD."acceptedByClerkUserId" OR
     NEW."verifiedEmailDigest" IS DISTINCT FROM OLD."verifiedEmailDigest" OR
     NEW."acceptanceEvidenceDigest" IS DISTINCT FROM OLD."acceptanceEvidenceDigest" OR
     NEW."withdrawnAt" IS DISTINCT FROM OLD."withdrawnAt" THEN
   RAISE EXCEPTION 'CHESS expiration cannot change acceptance proof';
  END IF;
 END IF;
 RETURN NEW;
END;
$$;

CREATE TRIGGER chess_consent_evidence_write_once
BEFORE INSERT OR UPDATE OR DELETE ON "ChessClientConsent"
FOR EACH ROW EXECUTE FUNCTION chess_reject_consent_evidence_tampering();
