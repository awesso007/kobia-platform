-- Sprint 18: Workflows / Visual Automation Builder - a visual node-graph editor
-- layered on top of the existing automations engine. A Workflow stores a graph
-- (nodes + edges) and an entryTriggerType; dispatchAutomation starts a
-- WorkflowRun when a matching event fires. Runs step through nodes, writing one
-- WorkflowStepLog per node, and may pause (status=WAITING + resumeAt) for delays
-- or wait_until, resumed by the workflow-resumer cron.
--
-- Additive only: new enums and new tables. Applied per tenant schema via raw
-- SQL + search_path (scripts/apply-0018-acme.ts).

-- CreateEnum: Sprint 18 workflow enums.
CREATE TYPE "WorkflowStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');
CREATE TYPE "WorkflowRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'CANCELED', 'WAITING');
CREATE TYPE "WorkflowStepStatus" AS ENUM ('SUCCESS', 'FAILED', 'SKIPPED', 'WAITING');
CREATE TYPE "WorkflowVariableType" AS ENUM ('STRING', 'NUMBER', 'BOOLEAN', 'JSON');

-- CreateTable Workflow.
CREATE TABLE "Workflow" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "graph" JSONB NOT NULL,
    "entryTriggerType" TEXT NOT NULL,
    "entryTriggerFilter" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable WorkflowRun.
CREATE TABLE "WorkflowRun" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "triggeredBy" JSONB,
    "status" "WorkflowRunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "currentNodeId" TEXT,
    "resumeAt" TIMESTAMP(3),
    "context" JSONB,
    "error" TEXT,
    CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable WorkflowStepLog.
CREATE TABLE "WorkflowStepLog" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "nodeType" TEXT NOT NULL,
    "status" "WorkflowStepStatus" NOT NULL,
    "input" JSONB,
    "output" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "WorkflowStepLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable WorkflowVariable.
CREATE TABLE "WorkflowVariable" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "WorkflowVariableType" NOT NULL DEFAULT 'STRING',
    "defaultValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkflowVariable_pkey" PRIMARY KEY ("id")
);

-- Indexes.
CREATE INDEX "Workflow_status_idx" ON "Workflow"("status");
CREATE INDEX "Workflow_entryTriggerType_idx" ON "Workflow"("entryTriggerType");
CREATE INDEX "WorkflowRun_workflowId_idx" ON "WorkflowRun"("workflowId");
CREATE INDEX "WorkflowRun_status_idx" ON "WorkflowRun"("status");
CREATE INDEX "WorkflowRun_resumeAt_idx" ON "WorkflowRun"("resumeAt");
CREATE INDEX "WorkflowStepLog_runId_idx" ON "WorkflowStepLog"("runId");
CREATE UNIQUE INDEX "WorkflowVariable_workflowId_name_key" ON "WorkflowVariable"("workflowId", "name");
CREATE INDEX "WorkflowVariable_workflowId_idx" ON "WorkflowVariable"("workflowId");

-- Foreign keys.
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowStepLog" ADD CONSTRAINT "WorkflowStepLog_runId_fkey" FOREIGN KEY ("runId") REFERENCES "WorkflowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowVariable" ADD CONSTRAINT "WorkflowVariable_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
