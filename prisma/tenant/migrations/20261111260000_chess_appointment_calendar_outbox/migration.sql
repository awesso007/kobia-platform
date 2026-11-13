-- Private appointment event delivery. Uses existing ChessCalendarSyncStatus enum.
-- UNIQUE appointmentId prevents duplicate event creation under parallel booking.
CREATE TABLE "ChessAppointmentCalendarOutbox" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "businessId" TEXT NOT NULL,
 "appointmentId" TEXT NOT NULL,
 "recipientClerkUserId" TEXT NOT NULL,
 "startsAt" TIMESTAMP(3) NOT NULL,
 "endsAt" TIMESTAMP(3) NOT NULL,
 "idempotencyKey" TEXT NOT NULL,
 "providerEventId" TEXT,
 "status" "ChessCalendarSyncStatus" NOT NULL DEFAULT 'WAITING_CONSENT',
 "lastErrorCode" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "ChessAppointmentCalendarOutbox_appointmentId_key" ON "ChessAppointmentCalendarOutbox"("appointmentId");
CREATE UNIQUE INDEX "ChessAppointmentCalendarOutbox_idempotencyKey_key" ON "ChessAppointmentCalendarOutbox"("idempotencyKey");
CREATE INDEX "ChessAppointmentCalendarOutbox_businessId_status_idx" ON "ChessAppointmentCalendarOutbox"("businessId","status");
CREATE INDEX "ChessAppointmentCalendarOutbox_recipientClerkUserId_status_idx" ON "ChessAppointmentCalendarOutbox"("recipientClerkUserId","status");
