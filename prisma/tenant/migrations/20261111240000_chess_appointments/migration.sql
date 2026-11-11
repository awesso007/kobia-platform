-- M4 appointment scheduling; staff overlap prevented by PostgreSQL.
-- btree_gist enables equals comparisons on text alongside tsrange overlap.
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TYPE "ChessAppointmentStatus" AS ENUM ('SCHEDULED','COMPLETED','CANCELLED');
CREATE TABLE "ChessAppointment" (
 "id" TEXT PRIMARY KEY,
 "businessId" TEXT NOT NULL,
 "clientProfileId" TEXT,
 "assignedClerkUserId" TEXT NOT NULL,
 "subject" TEXT NOT NULL,
 "startAt" TIMESTAMP(3) NOT NULL,
 "endAt" TIMESTAMP(3) NOT NULL,
 "status" "ChessAppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
 "createdByClerkUserId" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ChessAppointment_valid_window" CHECK ("endAt">"startAt")
);
CREATE INDEX "ChessAppointment_businessId_startAt_idx" ON "ChessAppointment"("businessId","startAt");
CREATE INDEX "ChessAppointment_assignedClerkUserId_startAt_idx" ON "ChessAppointment"("assignedClerkUserId","startAt");
-- Half-open interval [start,end): adjacent appointments are permitted.
-- A released appointment no longer blocks the slot.
ALTER TABLE "ChessAppointment"
 ADD CONSTRAINT "ChessAppointment_no_staff_overlap" EXCLUDE USING gist (
  "businessId" WITH =,
  "assignedClerkUserId" WITH =,
  tsrange("startAt","endAt",'[)') WITH &&
 ) WHERE ("status"='SCHEDULED');
