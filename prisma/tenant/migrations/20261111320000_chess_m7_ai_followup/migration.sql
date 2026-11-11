-- Low-risk AI actions require separate human execution and cannot change the
-- underlying work-item status or any financial/regulated record.
ALTER TABLE "ChessAiSuggestion"
 ADD COLUMN "appliedAt" TIMESTAMP(3),
 ADD COLUMN "followupWorkItemId" TEXT;
ALTER TABLE "ChessAiSuggestion"
 ADD CONSTRAINT "ChessAiSuggestion_applied_requires_approval"
 CHECK ("appliedAt" IS NULL OR "status"='ACCEPTED');
ALTER TABLE "ChessAiSuggestion"
 ADD CONSTRAINT "ChessAiSuggestion_applied_has_followup"
 CHECK (("appliedAt" IS NULL AND "followupWorkItemId" IS NULL) OR
        ("appliedAt" IS NOT NULL AND "followupWorkItemId" IS NOT NULL));
