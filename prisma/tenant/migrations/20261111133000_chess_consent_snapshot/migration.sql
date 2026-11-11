-- Preserve the exact consent policy text presented to each client.
-- Existing consent requests have no verified policy snapshot and remain unusable
-- until reissued. Never backfill consent as GRANTED.
ALTER TABLE "ChessClientConsent"
  ADD COLUMN "policyText" TEXT NOT NULL DEFAULT '';
