-- M4: disabled/blocked recurring templates must not monopolize the
-- bounded scheduler window across invocations. Inspection is not completion.
ALTER TABLE "ChessWorkRecurrence"
 ADD COLUMN "lastInspectedAt" TIMESTAMP(3);
CREATE INDEX "ChessWorkRecurrence_active_lastInspectedAt_nextRunAt_idx"
 ON "ChessWorkRecurrence"("active","lastInspectedAt","nextRunAt");
