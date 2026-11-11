-- Staff opt in individually before CHESS sends any work metadata to
-- an approved external calendar integration. Defaults to disabled.
CREATE TABLE "ChessCalendarPreference" (
  "clerkUserId" TEXT NOT NULL PRIMARY KEY,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "acknowledgedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
