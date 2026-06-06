-- Sprint 12: Calendar + Scheduling + Booking Pages + Meeting Rooms.
-- Additive only: new enums, new tables, new values on existing enums
-- (SearchEntityType, AutomationEntity, AutomationTrigger). No DROP on data.
-- Applied per tenant schema via raw SQL + search_path (scripts/apply-0012-acme.ts).

-- AlterEnum: SearchEntityType (index events + booking pages).
ALTER TYPE "SearchEntityType" ADD VALUE IF NOT EXISTS 'EVENT';
ALTER TYPE "SearchEntityType" ADD VALUE IF NOT EXISTS 'BOOKING_PAGE';

-- AlterEnum: AutomationEntity (event + booking automations).
ALTER TYPE "AutomationEntity" ADD VALUE IF NOT EXISTS 'EVENT';
ALTER TYPE "AutomationEntity" ADD VALUE IF NOT EXISTS 'BOOKING';

-- AlterEnum: AutomationTrigger (calendar + booking lifecycle).
ALTER TYPE "AutomationTrigger" ADD VALUE IF NOT EXISTS 'EVENT_CREATED';
ALTER TYPE "AutomationTrigger" ADD VALUE IF NOT EXISTS 'EVENT_STARTING_SOON';
ALTER TYPE "AutomationTrigger" ADD VALUE IF NOT EXISTS 'BOOKING_CONFIRMED';

-- AlterEnum: NotificationType (event invites/reminders + booking notices).
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EVENT_INVITE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EVENT_REMINDER';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BOOKING_CREATED';

-- CreateEnum: Sprint 12 enums.
CREATE TYPE "CalendarType" AS ENUM ('PERSONAL', 'TEAM', 'RESOURCE', 'EXTERNAL_GOOGLE', 'EXTERNAL_OUTLOOK', 'EXTERNAL_ICS');
CREATE TYPE "CalendarVisibility" AS ENUM ('PRIVATE', 'TEAM', 'TENANT');
CREATE TYPE "CalEventStatus" AS ENUM ('CONFIRMED', 'TENTATIVE', 'CANCELED');
CREATE TYPE "CalEventVisibility" AS ENUM ('PUBLIC', 'PRIVATE', 'CONFIDENTIAL');
CREATE TYPE "CalEventSource" AS ENUM ('MANUAL', 'API', 'BOOKING', 'AUTOMATION', 'EXTERNAL_SYNC');
CREATE TYPE "CalRelatedRecordType" AS ENUM ('LEAD', 'DEAL', 'CONTACT', 'COMPANY', 'PROJECT', 'TASK');
CREATE TYPE "AttendeeResponse" AS ENUM ('NEEDS_ACTION', 'ACCEPTED', 'DECLINED', 'TENTATIVE');
CREATE TYPE "BookingLocationType" AS ENUM ('PHONE', 'VIDEO_LINK', 'IN_PERSON', 'CUSTOM');
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELED', 'RESCHEDULED');

-- CreateTable Calendar.
CREATE TABLE "Calendar" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerClerkUserId" TEXT,
    "type" "CalendarType" NOT NULL DEFAULT 'PERSONAL',
    "color" TEXT NOT NULL DEFAULT '#1d77bd',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "visibility" "CalendarVisibility" NOT NULL DEFAULT 'TEAM',
    "externalAccountId" TEXT,
    "externalCalendarId" TEXT,
    "externalUrl" TEXT,
    "syncToken" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Calendar_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Calendar_ownerClerkUserId_idx" ON "Calendar"("ownerClerkUserId");
CREATE INDEX "Calendar_type_idx" ON "Calendar"("type");

-- CreateTable CalendarEvent.
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "locationUrl" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "status" "CalEventStatus" NOT NULL DEFAULT 'CONFIRMED',
    "visibility" "CalEventVisibility" NOT NULL DEFAULT 'PUBLIC',
    "organizerClerkUserId" TEXT,
    "recurrenceRule" TEXT,
    "recurrenceExceptions" JSONB,
    "parentEventId" TEXT,
    "colorOverride" TEXT,
    "reminders" JSONB,
    "externalId" TEXT,
    "externalEtag" TEXT,
    "source" "CalEventSource" NOT NULL DEFAULT 'MANUAL',
    "relatedRecordType" "CalRelatedRecordType",
    "relatedRecordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CalendarEvent_calendarId_startAt_idx" ON "CalendarEvent"("calendarId", "startAt");
CREATE INDEX "CalendarEvent_relatedRecordType_relatedRecordId_idx" ON "CalendarEvent"("relatedRecordType", "relatedRecordId");
CREATE INDEX "CalendarEvent_organizerClerkUserId_startAt_idx" ON "CalendarEvent"("organizerClerkUserId", "startAt");
CREATE INDEX "CalendarEvent_externalId_idx" ON "CalendarEvent"("externalId");

-- CreateTable EventAttendee.
CREATE TABLE "EventAttendee" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "clerkUserId" TEXT,
    "contactId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "response" "AttendeeResponse" NOT NULL DEFAULT 'NEEDS_ACTION',
    "isOrganizer" BOOLEAN NOT NULL DEFAULT false,
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventAttendee_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EventAttendee_eventId_idx" ON "EventAttendee"("eventId");
CREATE INDEX "EventAttendee_clerkUserId_idx" ON "EventAttendee"("clerkUserId");
CREATE INDEX "EventAttendee_contactId_idx" ON "EventAttendee"("contactId");

-- CreateTable MeetingRoom.
CREATE TABLE "MeetingRoom" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "capacity" INTEGER,
    "color" TEXT NOT NULL DEFAULT '#7d4aea',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MeetingRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable RoomBooking.
CREATE TABLE "RoomBooking" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoomBooking_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RoomBooking_roomId_eventId_key" ON "RoomBooking"("roomId", "eventId");
CREATE INDEX "RoomBooking_eventId_idx" ON "RoomBooking"("eventId");

-- CreateTable BookingPage.
CREATE TABLE "BookingPage" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ownerClerkUserId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "bufferBeforeMinutes" INTEGER NOT NULL DEFAULT 0,
    "bufferAfterMinutes" INTEGER NOT NULL DEFAULT 0,
    "minNoticeMinutes" INTEGER NOT NULL DEFAULT 60,
    "maxAdvanceDays" INTEGER NOT NULL DEFAULT 30,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "color" TEXT NOT NULL DEFAULT '#1d77bd',
    "locationType" "BookingLocationType" NOT NULL DEFAULT 'VIDEO_LINK',
    "locationDetails" TEXT,
    "requireApproval" BOOLEAN NOT NULL DEFAULT false,
    "redirectUrl" TEXT,
    "customQuestions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BookingPage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BookingPage_slug_key" ON "BookingPage"("slug");
CREATE INDEX "BookingPage_ownerClerkUserId_idx" ON "BookingPage"("ownerClerkUserId");

-- CreateTable BookingAvailability.
CREATE TABLE "BookingAvailability" (
    "id" TEXT NOT NULL,
    "bookingPageId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startMinutes" INTEGER NOT NULL,
    "endMinutes" INTEGER NOT NULL,
    CONSTRAINT "BookingAvailability_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BookingAvailability_bookingPageId_idx" ON "BookingAvailability"("bookingPageId");

-- CreateTable Booking.
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "bookingPageId" TEXT NOT NULL,
    "eventId" TEXT,
    "inviteeName" TEXT NOT NULL,
    "inviteeEmail" TEXT NOT NULL,
    "inviteePhone" TEXT,
    "inviteeTimezone" TEXT NOT NULL DEFAULT 'UTC',
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "rescheduleToken" TEXT,
    "customAnswers" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Booking_bookingPageId_startAt_idx" ON "Booking"("bookingPageId", "startAt");

-- CreateTable Availability.
CREATE TABLE "Availability" (
    "id" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startMinutes" INTEGER NOT NULL,
    "endMinutes" INTEGER NOT NULL,
    CONSTRAINT "Availability_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Availability_clerkUserId_idx" ON "Availability"("clerkUserId");

-- AddForeignKey.
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "Calendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventAttendee" ADD CONSTRAINT "EventAttendee_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoomBooking" ADD CONSTRAINT "RoomBooking_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "MeetingRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoomBooking" ADD CONSTRAINT "RoomBooking_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingAvailability" ADD CONSTRAINT "BookingAvailability_bookingPageId_fkey" FOREIGN KEY ("bookingPageId") REFERENCES "BookingPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_bookingPageId_fkey" FOREIGN KEY ("bookingPageId") REFERENCES "BookingPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
