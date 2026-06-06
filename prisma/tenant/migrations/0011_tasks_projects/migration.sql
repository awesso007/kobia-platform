-- Sprint 11: Tasks + Projects. Additive only: new enums, new tables, new values
-- on existing enums (NotificationType, SearchEntityType, AutomationEntity,
-- AutomationTrigger). No DROP on existing data.
-- Applied per tenant schema via raw SQL + search_path (scripts/apply-0011-acme.ts).

-- AlterEnum: NotificationType (task notifications).
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TASK_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TASK_DUE_SOON';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TASK_MENTIONED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TASK_COMMENTED';

-- AlterEnum: SearchEntityType (index tasks, projects, comments).
ALTER TYPE "SearchEntityType" ADD VALUE IF NOT EXISTS 'TASK';
ALTER TYPE "SearchEntityType" ADD VALUE IF NOT EXISTS 'PROJECT';
ALTER TYPE "SearchEntityType" ADD VALUE IF NOT EXISTS 'TASK_COMMENT';

-- AlterEnum: AutomationEntity (task + project automations).
ALTER TYPE "AutomationEntity" ADD VALUE IF NOT EXISTS 'TASK';
ALTER TYPE "AutomationEntity" ADD VALUE IF NOT EXISTS 'PROJECT';

-- AlterEnum: AutomationTrigger (task + project lifecycle).
ALTER TYPE "AutomationTrigger" ADD VALUE IF NOT EXISTS 'TASK_CREATED';
ALTER TYPE "AutomationTrigger" ADD VALUE IF NOT EXISTS 'TASK_STATUS_CHANGED';
ALTER TYPE "AutomationTrigger" ADD VALUE IF NOT EXISTS 'TASK_DUE_SOON';
ALTER TYPE "AutomationTrigger" ADD VALUE IF NOT EXISTS 'TASK_OVERDUE';
ALTER TYPE "AutomationTrigger" ADD VALUE IF NOT EXISTS 'PROJECT_STATUS_CHANGED';

-- CreateEnum: Sprint 11 enums.
CREATE TYPE "ProjectStatus" AS ENUM ('PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED');
CREATE TYPE "ProjectVisibility" AS ENUM ('PRIVATE', 'TEAM', 'TENANT');
CREATE TYPE "ProjectMemberRole" AS ENUM ('OWNER', 'LEAD', 'MEMBER', 'VIEWER');
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'BLOCKED', 'CANCELED');
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "TaskDependencyType" AS ENUM ('FINISH_TO_START', 'START_TO_START', 'FINISH_TO_FINISH', 'START_TO_FINISH');

-- CreateTable Project (self-ref for subprojects).
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'PLANNING',
    "visibility" "ProjectVisibility" NOT NULL DEFAULT 'TEAM',
    "ownerClerkUserId" TEXT,
    "startDate" DATE,
    "endDate" DATE,
    "budget" DECIMAL(15,2),
    "color" TEXT,
    "parentProjectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Project_key_key" ON "Project" ("key");
CREATE INDEX IF NOT EXISTS "Project_status_idx" ON "Project" ("status");
CREATE INDEX IF NOT EXISTS "Project_ownerClerkUserId_idx" ON "Project" ("ownerClerkUserId");
CREATE INDEX IF NOT EXISTS "Project_parentProjectId_idx" ON "Project" ("parentProjectId");

-- CreateTable ProjectMember.
CREATE TABLE "ProjectMember" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "role" "ProjectMemberRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectMember_projectId_clerkUserId_key" ON "ProjectMember" ("projectId", "clerkUserId");
CREATE INDEX IF NOT EXISTS "ProjectMember_clerkUserId_idx" ON "ProjectMember" ("clerkUserId");

-- CreateTable TaskList (nullable projectId means a personal list).
CREATE TABLE "TaskList" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TaskList_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TaskList_projectId_idx" ON "TaskList" ("projectId");

-- CreateTable Task.
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "listId" TEXT,
    "parentTaskId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL',
    "assigneeClerkUserId" TEXT,
    "reporterClerkUserId" TEXT,
    "dueAt" TIMESTAMP(3),
    "startAt" TIMESTAMP(3),
    "estimatedMinutes" INTEGER,
    "actualMinutes" INTEGER NOT NULL DEFAULT 0,
    "progressPct" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Task_projectId_status_idx" ON "Task" ("projectId", "status");
CREATE INDEX IF NOT EXISTS "Task_assigneeClerkUserId_idx" ON "Task" ("assigneeClerkUserId");
CREATE INDEX IF NOT EXISTS "Task_dueAt_idx" ON "Task" ("dueAt");
CREATE INDEX IF NOT EXISTS "Task_parentTaskId_idx" ON "Task" ("parentTaskId");
CREATE INDEX IF NOT EXISTS "Task_deletedAt_idx" ON "Task" ("deletedAt");

-- CreateTable TaskDependency.
CREATE TABLE "TaskDependency" (
    "id" TEXT NOT NULL,
    "predecessorTaskId" TEXT NOT NULL,
    "successorTaskId" TEXT NOT NULL,
    "type" "TaskDependencyType" NOT NULL DEFAULT 'FINISH_TO_START',
    "lagMinutes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskDependency_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TaskDependency_predecessorTaskId_successorTaskId_key" ON "TaskDependency" ("predecessorTaskId", "successorTaskId");
CREATE INDEX IF NOT EXISTS "TaskDependency_successorTaskId_idx" ON "TaskDependency" ("successorTaskId");

-- CreateTable TimeEntry.
CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL,
    "taskId" TEXT,
    "projectId" TEXT,
    "clerkUserId" TEXT NOT NULL,
    "description" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "durationMinutes" INTEGER NOT NULL DEFAULT 0,
    "billable" BOOLEAN NOT NULL DEFAULT false,
    "hourlyRateCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TimeEntry_taskId_idx" ON "TimeEntry" ("taskId");
CREATE INDEX IF NOT EXISTS "TimeEntry_projectId_idx" ON "TimeEntry" ("projectId");
CREATE INDEX IF NOT EXISTS "TimeEntry_clerkUserId_idx" ON "TimeEntry" ("clerkUserId");

-- CreateTable TaskComment (mentions Json defaults to empty array).
CREATE TABLE "TaskComment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "mentions" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TaskComment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TaskComment_taskId_idx" ON "TaskComment" ("taskId");

-- CreateTable TaskAttachment (fileId references the Sprint 8 File table).
CREATE TABLE "TaskAttachment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "attachedByClerkUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskAttachment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TaskAttachment_taskId_idx" ON "TaskAttachment" ("taskId");
CREATE INDEX IF NOT EXISTS "TaskAttachment_fileId_idx" ON "TaskAttachment" ("fileId");

-- CreateTable Checklist.
CREATE TABLE "Checklist" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Checklist_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Checklist_taskId_idx" ON "Checklist" ("taskId");

-- CreateTable ChecklistItem.
CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL,
    "checklistId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "completedByClerkUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ChecklistItem_checklistId_idx" ON "ChecklistItem" ("checklistId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_parentProjectId_fkey" FOREIGN KEY ("parentProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskList" ADD CONSTRAINT "TaskList_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_listId_fkey" FOREIGN KEY ("listId") REFERENCES "TaskList"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_parentTaskId_fkey" FOREIGN KEY ("parentTaskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_predecessorTaskId_fkey" FOREIGN KEY ("predecessorTaskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_successorTaskId_fkey" FOREIGN KEY ("successorTaskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Checklist" ADD CONSTRAINT "Checklist_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "Checklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
