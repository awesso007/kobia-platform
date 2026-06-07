/*
 * Workflow runner (Sprint 18, server-only). Drives a WorkflowRun through the
 * graph one node at a time, writing a WorkflowStepLog per node. Logic nodes
 * (condition / delay / wait_until / branch / parallel / end) steer traversal;
 * action nodes delegate to node-handlers. A run that hits a delay or an unmet
 * wait_until is parked (status=WAITING + resumeAt) and picked up later by
 * resumeWaitingRuns (the workflow-resumer cron).
 *
 * The runner never throws into its caller (dispatch/cron): node failures are
 * recorded on the step log and the run is marked FAILED, but the originating
 * event still succeeds.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import type { PrismaClient } from "@/lib/db/generated/tenant";
import { runActionNode } from "./node-handlers";
import {
  asGraph,
  effectiveNodeType,
  evaluateExpression,
  findTriggerNode,
  getNode,
  nextNodeIds,
  type WorkflowGraph,
  type WorkflowNode,
} from "./workflow-utils";

type Db = PrismaClient;

const MAX_STEPS_PER_TICK = 50;

/**
 * Create a WorkflowRun for a workflow and immediately process it until it
 * completes, fails, or parks (WAITING). Returns the run id. Safe to call from
 * dispatch; swallows its own errors.
 */
export async function startRun(
  db: Db,
  workflowId: string,
  triggerPayload: Record<string, unknown>,
): Promise<string | null> {
  try {
    const workflow = await db.workflow.findUnique({ where: { id: workflowId } });
    if (!workflow) return null;
    const graph = asGraph(workflow.graph);
    const trigger = findTriggerNode(graph);
    const firstNodeId = trigger ? (nextNodeIds(graph, trigger.id)[0] ?? null) : null;

    const run = await db.workflowRun.create({
      data: {
        workflowId,
        triggeredBy: triggerPayload as never,
        status: "RUNNING",
        currentNodeId: firstNodeId,
        context: triggerPayload as never,
      },
    });

    if (!firstNodeId) {
      await db.workflowRun.update({
        where: { id: run.id },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
      return run.id;
    }

    await processRun(db, run.id);
    return run.id;
  } catch (err) {
    console.error("[workflow startRun] failed", err);
    return null;
  }
}

/**
 * Advance a single run from its currentNodeId until it parks, ends, or fails.
 * Bounded by MAX_STEPS_PER_TICK to avoid runaway loops within one invocation.
 */
export async function processRun(db: Db, runId: string): Promise<void> {
  const run = await db.workflowRun.findUnique({ where: { id: runId } });
  if (!run || (run.status !== "RUNNING" && run.status !== "WAITING")) return;
  const workflow = await db.workflow.findUnique({ where: { id: run.workflowId } });
  if (!workflow) return;
  const graph = asGraph(workflow.graph);

  let currentNodeId: string | null = run.currentNodeId;
  let context = (run.context ?? {}) as Record<string, unknown>;

  // A resumed WAITING run starts RUNNING again.
  if (run.status === "WAITING") {
    await db.workflowRun.update({ where: { id: runId }, data: { status: "RUNNING", resumeAt: null } });
  }

  for (let i = 0; i < MAX_STEPS_PER_TICK; i++) {
    if (!currentNodeId) {
      await finish(db, runId, "COMPLETED");
      return;
    }
    const node = getNode(graph, currentNodeId);
    if (!node) {
      await finish(db, runId, "COMPLETED");
      return;
    }
    const nodeType = effectiveNodeType(node);

    // Terminal node.
    if (nodeType === "logic.end") {
      await logStep(db, runId, node, nodeType, "SUCCESS", context, { ended: true });
      await finish(db, runId, "COMPLETED");
      return;
    }

    const result = await advanceNode(db, runId, graph, node, nodeType, context);
    if (result.kind === "wait") {
      await db.workflowRun.update({
        where: { id: runId },
        data: { status: "WAITING", currentNodeId: result.parkNodeId, resumeAt: result.resumeAt, context: context as never },
      });
      return;
    }
    if (result.kind === "fail") {
      await db.workflowRun.update({ where: { id: runId }, data: { context: context as never } });
      await finish(db, runId, "FAILED", result.error);
      return;
    }
    context = result.context;
    currentNodeId = result.nextNodeId;
    await db.workflowRun.update({
      where: { id: runId },
      data: { currentNodeId, context: context as never },
    });
  }
  // Hit the per-tick ceiling; park briefly so a later tick continues.
  await db.workflowRun.update({
    where: { id: runId },
    data: { status: "WAITING", resumeAt: new Date(Date.now() + 60_000), context: context as never },
  });
}

type AdvanceResult =
  | { kind: "next"; nextNodeId: string | null; context: Record<string, unknown> }
  | { kind: "wait"; parkNodeId: string; resumeAt: Date }
  | { kind: "fail"; error: string };

async function advanceNode(
  db: Db,
  runId: string,
  graph: WorkflowGraph,
  node: WorkflowNode,
  nodeType: string,
  context: Record<string, unknown>,
): Promise<AdvanceResult> {
  // Logic: condition - branch yes/no on an expression.
  if (nodeType === "logic.condition") {
    const expr = String(node.data?.expression ?? "");
    const pass = evaluateExpression(expr, context);
    await logStep(db, runId, node, nodeType, "SUCCESS", { expression: expr }, { result: pass });
    const handle = pass ? "yes" : "no";
    const next = nextNodeIds(graph, node.id, handle)[0] ?? nextNodeIds(graph, node.id)[0] ?? null;
    return { kind: "next", nextNodeId: next, context };
  }

  // Logic: delay - park until now + durationMinutes.
  if (nodeType === "logic.delay") {
    const minutes = Number(node.data?.durationMinutes);
    const resumeAt = new Date(Date.now() + (Number.isFinite(minutes) ? minutes : 0) * 60_000);
    const next = nextNodeIds(graph, node.id)[0] ?? null;
    await logStep(db, runId, node, nodeType, "WAITING", { durationMinutes: minutes }, { resumeAt: resumeAt.toISOString() });
    // Park at the downstream node so resume continues from there.
    if (!next) return { kind: "next", nextNodeId: null, context };
    return { kind: "wait", parkNodeId: next, resumeAt };
  }

  // Logic: wait_until - if condition already true, continue; else park until timeout.
  if (nodeType === "logic.wait_until") {
    const expr = String(node.data?.expression ?? "");
    const pass = evaluateExpression(expr, context);
    const next = nextNodeIds(graph, node.id)[0] ?? null;
    if (pass) {
      await logStep(db, runId, node, nodeType, "SUCCESS", { expression: expr }, { result: true });
      return { kind: "next", nextNodeId: next, context };
    }
    const timeout = Number(node.data?.timeoutMinutes);
    const resumeAt = new Date(Date.now() + (Number.isFinite(timeout) && timeout > 0 ? timeout : 60) * 60_000);
    await logStep(db, runId, node, nodeType, "WAITING", { expression: expr }, { resumeAt: resumeAt.toISOString() });
    // Park at this node again so the condition is re-checked on resume.
    return { kind: "wait", parkNodeId: node.id, resumeAt };
  }

  // Logic: branch - switch on a field value against named case handles.
  if (nodeType === "logic.branch") {
    const field = String(node.data?.field ?? "");
    const value = field ? String((context as Record<string, unknown>)[field] ?? context[field] ?? "") : "";
    await logStep(db, runId, node, nodeType, "SUCCESS", { field }, { value });
    const next =
      nextNodeIds(graph, node.id, value)[0] ??
      nextNodeIds(graph, node.id, "default")[0] ??
      nextNodeIds(graph, node.id)[0] ??
      null;
    return { kind: "next", nextNodeId: next, context };
  }

  // Logic: parallel - run all downstream branches sequentially (wait_all),
  // then continue past via a "done" handle if present.
  if (nodeType === "logic.parallel") {
    const branches = nextNodeIds(graph, node.id, "out");
    await logStep(db, runId, node, nodeType, "SUCCESS", { branches: branches.length }, { fanOut: branches.length });
    for (const branchStart of branches) {
      await runBranch(db, runId, graph, branchStart, context);
    }
    const cont = nextNodeIds(graph, node.id, "done")[0] ?? null;
    return { kind: "next", nextNodeId: cont, context };
  }

  // Trigger node (if reached directly) just flows to its first downstream node.
  if (nodeType === "trigger") {
    const next = nextNodeIds(graph, node.id)[0] ?? null;
    return { kind: "next", nextNodeId: next, context };
  }

  // Action node.
  try {
    const res = await runActionNode(db, node, nodeType, context);
    const skipped = res.output?.skipped === true;
    await logStep(db, runId, node, nodeType, skipped ? "SKIPPED" : "SUCCESS", node.data ?? {}, res.output);
    const nextContext = res.contextPatch ? { ...context, ...res.contextPatch } : context;
    const next = nextNodeIds(graph, node.id)[0] ?? null;
    return { kind: "next", nextNodeId: next, context: nextContext };
  } catch (err) {
    const message = String(err instanceof Error ? err.message : err);
    await logStep(db, runId, node, nodeType, "FAILED", node.data ?? {}, null, message);
    return { kind: "fail", error: message };
  }
}

/**
 * Execute a parallel branch inline (no parking). Delays inside a parallel branch
 * are collapsed to immediate execution to keep fan-out simple in v0.1.
 */
async function runBranch(
  db: Db,
  runId: string,
  graph: WorkflowGraph,
  startNodeId: string,
  context: Record<string, unknown>,
): Promise<void> {
  let nodeId: string | null = startNodeId;
  for (let i = 0; i < MAX_STEPS_PER_TICK && nodeId; i++) {
    const node = getNode(graph, nodeId);
    if (!node) return;
    const nodeType = effectiveNodeType(node);
    if (nodeType === "logic.end") {
      await logStep(db, runId, node, nodeType, "SUCCESS", context, { ended: true });
      return;
    }
    if (nodeType.startsWith("logic.")) {
      // Inside a parallel branch, logic nodes just pass through their first edge.
      nodeId = nextNodeIds(graph, node.id)[0] ?? null;
      continue;
    }
    try {
      const res = await runActionNode(db, node, nodeType, context);
      const skipped = res.output?.skipped === true;
      await logStep(db, runId, node, nodeType, skipped ? "SKIPPED" : "SUCCESS", node.data ?? {}, res.output);
    } catch (err) {
      await logStep(db, runId, node, nodeType, "FAILED", node.data ?? {}, null, String(err instanceof Error ? err.message : err));
    }
    nodeId = nextNodeIds(graph, node.id)[0] ?? null;
  }
}

async function logStep(
  db: Db,
  runId: string,
  node: WorkflowNode,
  nodeType: string,
  status: "SUCCESS" | "FAILED" | "SKIPPED" | "WAITING",
  input: unknown,
  output: unknown,
  error?: string,
): Promise<void> {
  await db.workflowStepLog.create({
    data: {
      runId,
      nodeId: node.id,
      nodeType,
      status: status as never,
      input: (input ?? undefined) as never,
      output: (output ?? undefined) as never,
      error: error ?? null,
      completedAt: new Date(),
    },
  });
}

async function finish(
  db: Db,
  runId: string,
  status: "COMPLETED" | "FAILED",
  error?: string,
): Promise<void> {
  await db.workflowRun.update({
    where: { id: runId },
    data: { status: status as never, completedAt: new Date(), currentNodeId: null, error: error ?? null },
  });
}

/**
 * Resume parked runs whose resumeAt has passed. Called by the workflow-resumer
 * cron with a schema-bound client. Returns how many runs were advanced.
 */
export async function resumeWaitingRuns(db: Db): Promise<{ resumed: number }> {
  const due = await db.workflowRun.findMany({
    where: { status: "WAITING", resumeAt: { lte: new Date() } },
    take: 50,
    select: { id: true },
  });
  let resumed = 0;
  for (const r of due) {
    try {
      await processRun(db, r.id);
      resumed++;
    } catch (err) {
      console.error("[workflow resume] failed for run", r.id, err);
    }
  }
  return { resumed };
}

/** Run a workflow against a sample payload immediately (the /test endpoint). */
export async function testRun(
  db: Db,
  workflowId: string,
  samplePayload: Record<string, unknown>,
): Promise<string | null> {
  return startRun(db, workflowId, { ...samplePayload, _test: true });
}

/** Cancel a run that is still RUNNING or WAITING. */
export async function cancelRun(db: Db, runId: string): Promise<void> {
  await db.workflowRun.updateMany({
    where: { id: runId, status: { in: ["RUNNING", "WAITING"] } },
    data: { status: "CANCELED", completedAt: new Date(), resumeAt: null },
  });
}
