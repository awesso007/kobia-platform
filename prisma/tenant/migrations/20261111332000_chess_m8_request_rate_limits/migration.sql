-- Per-tenant rate windows are located inside each isolated tenant schema.
-- A failed migration causes financial/AI/report API requests to fail closed.
CREATE TABLE "ChessRequestRateWindow" (
 "scope" VARCHAR(64) NOT NULL,
 "subjectDigest" CHAR(64) NOT NULL,
 "windowStart" TIMESTAMPTZ(3) NOT NULL,
 "hits" INTEGER NOT NULL DEFAULT 0,
 CONSTRAINT "ChessRequestRateWindow_pkey" PRIMARY KEY ("scope","subjectDigest","windowStart"),
 CONSTRAINT "ChessRequestRateWindow_hits_check" CHECK ("hits" >= 0 AND "hits" <= 10000)
);
CREATE INDEX "ChessRequestRateWindow_windowStart_idx"
 ON "ChessRequestRateWindow"("windowStart");
