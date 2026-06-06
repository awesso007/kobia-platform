-- Sprint 4: Activities extension + Automations engine.
-- Additive only: new nullable columns on CrmActivity, new enums, new tables.
-- No DROP on existing data.

-- AlterTable: task-style fields on the existing activity model.
ALTER TABLE "CrmActivity" ADD COLUMN "dueAt" TIMESTAMP(3);
ALTER TABLE "CrmActivity" ADD COLUMN "completedAt" TIMESTAMP(3);
ALTER TABLE "CrmActivity" ADD COLUMN "ownerClerkUserId" TEXT;

-- CreateIndex
CREATE INDEX "CrmActivity_dueAt_idx" ON "CrmActivity"("dueAt");
CREATE INDEX "CrmActivity_ownerClerkUserId_idx" ON "CrmActivity"("ownerClerkUserId");

-- CreateEnum
CREATE TYPE "AutomationEntity" AS ENUM ('LEAD', 'DEAL', 'CONTACT', 'COMPANY', 'ACTIVITY');

-- CreateEnum
CREATE TYPE "AutomationTrigger" AS ENUM ('RECORD_CREATED', 'RECORD_UPDATED', 'FIELD_CHANGED', 'STAGE_CHANGED', 'ACTIVITY_DUE', 'SCHEDULE');

-- CreateEnum
CREATE TYPE "AutomationRunStatus" AS ENUM ('SUCCESS', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "AutomationQueueStatus" AS ENUM ('PENDING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "Automation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "triggerType" "AutomationTrigger" NOT NULL,
    "triggerConfig" JSONB,
    "entityType" "AutomationEntity" NOT NULL,
    "conditions" JSONB,
    "actions" JSONB NOT NULL,
    "createdByClerkUserId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Automation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRun" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "entityType" "AutomationEntity" NOT NULL,
    "entityId" TEXT,
    "status" "AutomationRunStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,
    "actionsExecuted" JSONB,

    CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationQueue" (
    "id" TEXT NOT NULL,
    "automationRunId" TEXT NOT NULL,
    "resumeAt" TIMESTAMP(3) NOT NULL,
    "payload" JSONB,
    "status" "AutomationQueueStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationQueue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Automation_entityType_triggerType_enabled_idx" ON "Automation"("entityType", "triggerType", "enabled");
CREATE INDEX "Automation_deletedAt_idx" ON "Automation"("deletedAt");
CREATE INDEX "AutomationRun_automationId_startedAt_idx" ON "AutomationRun"("automationId", "startedAt");
CREATE INDEX "AutomationRun_status_idx" ON "AutomationRun"("status");
CREATE INDEX "AutomationQueue_status_resumeAt_idx" ON "AutomationQueue"("status", "resumeAt");

-- AddForeignKey
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationQueue" ADD CONSTRAINT "AutomationQueue_automationRunId_fkey" FOREIGN KEY ("automationRunId") REFERENCES "AutomationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
