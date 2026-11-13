-- Block external synchronization until the individual employee opts in.
ALTER TYPE "ChessCalendarSyncStatus" ADD VALUE 'WAITING_CONSENT';
