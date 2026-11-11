-- New opt-in category: existing work-item calendar consent is not
-- consent for sharing appointment timing with a third-party calendar.
ALTER TABLE "ChessCalendarPreference"
  ADD COLUMN "appointmentEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "appointmentAcknowledgedAt" TIMESTAMP(3),
  ADD COLUMN "appointmentRevokedAt" TIMESTAMP(3);
-- Prior appointment queue events remain WAITING_CONSENT unless a newly
-- recorded appointment-specific acknowledgement permits release.
UPDATE "ChessAppointmentCalendarOutbox"
  SET "status"='WAITING_CONSENT'
  WHERE "status"='PENDING';
