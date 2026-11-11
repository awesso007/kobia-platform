-- Model cancellation of already-synchronized external events.
-- Unknown deletion outcomes must be reconciled, not blindly retried.
ALTER TYPE "ChessCalendarSyncStatus" ADD VALUE 'CANCEL_PENDING';
ALTER TYPE "ChessCalendarSyncStatus" ADD VALUE 'CANCEL_SUBMITTING';
ALTER TYPE "ChessCalendarSyncStatus" ADD VALUE 'CANCEL_UNKNOWN';
