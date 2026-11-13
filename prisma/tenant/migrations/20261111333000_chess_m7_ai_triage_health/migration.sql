-- Separate scheduled AI triage heartbeat from recurrence and calendar jobs.
-- No client identifiers or model responses are persisted in worker health.
ALTER TYPE "ChessWorkerKind" ADD VALUE IF NOT EXISTS 'AI_TRIAGE';
