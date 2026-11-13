-- Security: bind each CHESS document scan to a specific S3 object version.
-- S3 bucket versioning must be enabled before accepting new sensitive uploads.
-- Existing READY rows without a stored version remain unavailable to download
-- until they are re-uploaded, scanned, and version-bound.
ALTER TABLE "ChessClientDocument"
  ADD COLUMN "storageVersionId" TEXT,
  ADD COLUMN "storageETag" TEXT;
