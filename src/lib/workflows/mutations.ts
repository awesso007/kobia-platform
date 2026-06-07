/*
 * Workflow write mutations (Sprint 18, server-only). Create / update / delete /
 * publish a Workflow and manage its variables. Each takes an explicit tenant db.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import type { PrismaClient } from "@/lib/db/generated/tenant";
import { asGraph, emptyGraph, type WorkflowGraph } from "./workflow-utils";

type Db = PrismaClient;

export type CreateWorkflowInput = {
  name: string;
  description?: string | null;
  entryTriggerType: string;
  entryTriggerFilter?: unknown;
  graph?: WorkflowGraph;
  createdById?: string | null;
};

/** Seed a fresh workflow with a single trigger node when no graph is given. */
function starterGraph(): WorkflowGraph {
  return {
    nodes: [{ id: "trigger", type: "trigger", data: { type: "trigger" }, position: { x: 80, y: 80 } }],
    edges: [],
  };
}

export async function createWorkflow(db: Db, input: CreateWorkflowInput): Promise<string> {
  const graph = input.graph ?? starterGraph();
  const w = await db.workflow.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      entryTriggerType: input.entryTriggerType,
      entryTriggerFilter: (input.entryTriggerFilter ?? undefined) as never,
      graph: graph as never,
      status: "DRAFT",
      createdById: input.createdById ?? null,
    },
  });
  return w.id;
}

export type UpdateWorkflowInput = {
  name?: string;
  description?: string | null;
  entryTriggerType?: string;
  entryTriggerFilter?: unknown;
  graph?: WorkflowGraph;
  status?: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
  variables?: { name: string; type: "STRING" | "NUMBER" | "BOOLEAN" | "JSON"; defaultValue?: string | null }[];
};

export async function updateWorkflow(db: Db, id: string, input: UpdateWorkflowInput): Promise<void> {
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description;
  if (input.entryTriggerType !== undefined) data.entryTriggerType = input.entryTriggerType;
  if (input.entryTriggerFilter !== undefined) data.entryTriggerFilter = input.entryTriggerFilter;
  if (input.graph !== undefined) data.graph = asGraph(input.graph);
  if (input.status !== undefined) data.status = input.status;

  await db.workflow.update({ where: { id }, data: data as never });

  if (input.variables) {
    await db.workflowVariable.deleteMany({ where: { workflowId: id } });
    for (const v of input.variables) {
      if (!v.name?.trim()) continue;
      await db.workflowVariable.create({
        data: { workflowId: id, name: v.name.trim(), type: v.type, defaultValue: v.defaultValue ?? null },
      });
    }
  }
}

/** Toggle status; bumps version when moving DRAFT -> ACTIVE. */
export async function setWorkflowStatus(
  db: Db,
  id: string,
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED",
): Promise<void> {
  const current = await db.workflow.findUnique({ where: { id }, select: { status: true, version: true } });
  const bump = current?.status === "DRAFT" && status === "ACTIVE";
  await db.workflow.update({
    where: { id },
    data: { status, ...(bump ? { version: { increment: 1 } } : {}) },
  });
}

export async function deleteWorkflow(db: Db, id: string): Promise<void> {
  await db.workflow.delete({ where: { id } });
}

export { emptyGraph };
