/*
 * Workflow read queries (Sprint 18, server-only). Thin wrappers over the tenant
 * db used by the authenticated API routes and the /app/workflows server pages.
 * Each takes an explicit db so callers control tenant scope.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import type { PrismaClient } from "@/lib/db/generated/tenant";
import { asGraph, successRate, type WorkflowGraph } from "./workflow-utils";

type Db = PrismaClient;

export type WorkflowListItem = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  entryTriggerType: string;
  version: number;
  lastRunAt: Date | null;
  lastRunStatus: string | null;
  successRate: number | null;
  runCount: number;
  updatedAt: Date;
};

export async function listWorkflows(db: Db): Promise<WorkflowListItem[]> {
  const workflows = await db.workflow.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      runs: { orderBy: { startedAt: "desc" }, take: 50, select: { status: true, startedAt: true } },
      _count: { select: { runs: true } },
    },
  });
  return workflows.map((w) => {
    const last = w.runs[0] ?? null;
    return {
      id: w.id,
      name: w.name,
      description: w.description,
      status: w.status,
      entryTriggerType: w.entryTriggerType,
      version: w.version,
      lastRunAt: last?.startedAt ?? null,
      lastRunStatus: last?.status ?? null,
      successRate: successRate(w.runs),
      runCount: w._count.runs,
      updatedAt: w.updatedAt,
    };
  });
}

export type WorkflowDetail = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  version: number;
  entryTriggerType: string;
  entryTriggerFilter: unknown;
  graph: WorkflowGraph;
  variables: { id: string; name: string; type: string; defaultValue: string | null }[];
  updatedAt: Date;
};

export async function getWorkflow(db: Db, id: string): Promise<WorkflowDetail | null> {
  const w = await db.workflow.findUnique({
    where: { id },
    include: { variables: { orderBy: { name: "asc" } } },
  });
  if (!w) return null;
  return {
    id: w.id,
    name: w.name,
    description: w.description,
    status: w.status,
    version: w.version,
    entryTriggerType: w.entryTriggerType,
    entryTriggerFilter: w.entryTriggerFilter,
    graph: asGraph(w.graph),
    variables: w.variables.map((v) => ({ id: v.id, name: v.name, type: v.type, defaultValue: v.defaultValue })),
    updatedAt: w.updatedAt,
  };
}

export type RunListItem = {
  id: string;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  currentNodeId: string | null;
  error: string | null;
  stepCount: number;
};

export async function listRuns(
  db: Db,
  workflowId: string,
  statusFilter?: string,
): Promise<RunListItem[]> {
  const runs = await db.workflowRun.findMany({
    where: { workflowId, ...(statusFilter ? { status: statusFilter as never } : {}) },
    orderBy: { startedAt: "desc" },
    take: 200,
    include: { _count: { select: { stepLogs: true } } },
  });
  return runs.map((r) => ({
    id: r.id,
    status: r.status,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    currentNodeId: r.currentNodeId,
    error: r.error,
    stepCount: r._count.stepLogs,
  }));
}

export type RunDetail = {
  id: string;
  workflowId: string;
  workflowName: string;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  currentNodeId: string | null;
  error: string | null;
  triggeredBy: unknown;
  context: unknown;
  steps: {
    id: string;
    nodeId: string;
    nodeType: string;
    status: string;
    input: unknown;
    output: unknown;
    error: string | null;
    startedAt: Date;
    completedAt: Date | null;
  }[];
};

export async function getRun(db: Db, workflowId: string, runId: string): Promise<RunDetail | null> {
  const run = await db.workflowRun.findFirst({
    where: { id: runId, workflowId },
    include: {
      workflow: { select: { name: true } },
      stepLogs: { orderBy: { startedAt: "asc" } },
    },
  });
  if (!run) return null;
  return {
    id: run.id,
    workflowId: run.workflowId,
    workflowName: run.workflow.name,
    status: run.status,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    currentNodeId: run.currentNodeId,
    error: run.error,
    triggeredBy: run.triggeredBy,
    context: run.context,
    steps: run.stepLogs.map((s) => ({
      id: s.id,
      nodeId: s.nodeId,
      nodeType: s.nodeType,
      status: s.status,
      input: s.input,
      output: s.output,
      error: s.error,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
    })),
  };
}
