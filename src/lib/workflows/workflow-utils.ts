/*
 * Workflow pure helpers (Sprint 18). No "use client" - safe to import from both
 * server lib and client UI. Holds the graph type shape, node-type catalog,
 * template rendering, simple condition evaluation, and graph traversal helpers
 * used by the runner and the visual editor.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */

export type WorkflowNode = {
  id: string;
  type: string;
  data: Record<string, unknown>;
  position: { x: number; y: number };
};

export type WorkflowEdge = {
  id: string;
  source: string;
  sourceHandle?: string | null;
  target: string;
};

export type WorkflowGraph = {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
};

export const WORKFLOW_STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"] as const;
export type WorkflowStatusName = (typeof WORKFLOW_STATUSES)[number];

export const RUN_STATUSES = ["RUNNING", "COMPLETED", "FAILED", "CANCELED", "WAITING"] as const;
export type RunStatusName = (typeof RUN_STATUSES)[number];

/** Node type catalog grouped for the palette. value = data.type stored in graph. */
export type NodeTypeDef = {
  type: string;
  label: string;
  group: "Triggers" | "Actions" | "Logic";
  /** Field hints rendered by the settings panel. */
  fields: { key: string; label: string; kind: "text" | "textarea" | "number" | "select"; options?: string[] }[];
};

export const NODE_TYPES: NodeTypeDef[] = [
  { type: "trigger", label: "Trigger", group: "Triggers", fields: [] },
  {
    type: "action.send_email",
    label: "Send email",
    group: "Actions",
    fields: [
      { key: "to", label: "To", kind: "text" },
      { key: "subject", label: "Subject", kind: "text" },
      { key: "body", label: "Body", kind: "textarea" },
    ],
  },
  {
    type: "action.send_sms",
    label: "Send SMS",
    group: "Actions",
    fields: [
      { key: "to", label: "To", kind: "text" },
      { key: "body", label: "Body", kind: "textarea" },
    ],
  },
  {
    type: "action.create_task",
    label: "Create task",
    group: "Actions",
    fields: [
      { key: "title", label: "Title", kind: "text" },
      { key: "assigneeId", label: "Assignee id", kind: "text" },
      { key: "dueInDays", label: "Due in days", kind: "number" },
    ],
  },
  {
    type: "action.create_deal",
    label: "Create deal",
    group: "Actions",
    fields: [
      { key: "name", label: "Name", kind: "text" },
      { key: "amount", label: "Amount", kind: "number" },
      { key: "pipelineId", label: "Pipeline id", kind: "text" },
      { key: "stageId", label: "Stage id", kind: "text" },
    ],
  },
  {
    type: "action.update_record",
    label: "Update record",
    group: "Actions",
    fields: [
      { key: "entity", label: "Entity", kind: "select", options: ["LEAD", "DEAL", "CONTACT", "COMPANY"] },
      { key: "recordId", label: "Record id", kind: "text" },
      { key: "fields", label: "Fields (JSON)", kind: "textarea" },
    ],
  },
  {
    type: "action.add_tag",
    label: "Add tag",
    group: "Actions",
    fields: [
      { key: "entity", label: "Entity", kind: "select", options: ["LEAD", "DEAL", "CONTACT", "COMPANY"] },
      { key: "recordId", label: "Record id", kind: "text" },
      { key: "tag", label: "Tag", kind: "text" },
    ],
  },
  {
    type: "action.remove_tag",
    label: "Remove tag",
    group: "Actions",
    fields: [
      { key: "entity", label: "Entity", kind: "select", options: ["LEAD", "DEAL", "CONTACT", "COMPANY"] },
      { key: "recordId", label: "Record id", kind: "text" },
      { key: "tag", label: "Tag", kind: "text" },
    ],
  },
  {
    type: "action.http_request",
    label: "HTTP request",
    group: "Actions",
    fields: [
      { key: "method", label: "Method", kind: "select", options: ["GET", "POST", "PUT", "PATCH", "DELETE"] },
      { key: "url", label: "URL", kind: "text" },
      { key: "headers", label: "Headers (JSON)", kind: "textarea" },
      { key: "body", label: "Body", kind: "textarea" },
    ],
  },
  {
    type: "action.create_notification",
    label: "Create notification",
    group: "Actions",
    fields: [
      { key: "userId", label: "User id", kind: "text" },
      { key: "message", label: "Message", kind: "textarea" },
    ],
  },
  {
    type: "action.webhook",
    label: "Webhook",
    group: "Actions",
    fields: [{ key: "url", label: "URL", kind: "text" }],
  },
  {
    type: "logic.condition",
    label: "Condition",
    group: "Logic",
    fields: [{ key: "expression", label: "Expression", kind: "text" }],
  },
  {
    type: "logic.delay",
    label: "Delay",
    group: "Logic",
    fields: [{ key: "durationMinutes", label: "Duration (minutes)", kind: "number" }],
  },
  {
    type: "logic.wait_until",
    label: "Wait until",
    group: "Logic",
    fields: [
      { key: "expression", label: "Condition", kind: "text" },
      { key: "timeoutMinutes", label: "Timeout (minutes)", kind: "number" },
    ],
  },
  {
    type: "logic.branch",
    label: "Branch (switch)",
    group: "Logic",
    fields: [
      { key: "field", label: "Field", kind: "text" },
      { key: "cases", label: "Cases (comma separated)", kind: "text" },
    ],
  },
  { type: "logic.parallel", label: "Parallel (fan-out)", group: "Logic", fields: [] },
  { type: "logic.end", label: "End", group: "Logic", fields: [] },
];

export function nodeTypeDef(type: string): NodeTypeDef | undefined {
  return NODE_TYPES.find((n) => n.type === type);
}

export function nodeLabel(type: string): string {
  return nodeTypeDef(type)?.label ?? type;
}

/** Replace {{var}} and {{record.field}} tokens against a flat context map. */
export function renderTemplate(template: string, context: Record<string, unknown>): string {
  if (typeof template !== "string") return "";
  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, path: string) => {
    const value = resolvePath(context, path);
    return value === null || value === undefined ? "" : String(value);
  });
}

/** Resolve a dotted path ("record.name" or "name") against a context object. */
export function resolvePath(context: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = context;
  for (const part of parts) {
    if (cur && typeof cur === "object" && part in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return cur;
}

/**
 * Evaluate a tiny boolean expression of the form `field op value`, where op is
 * one of == != > < >= <= contains. The left side is resolved against context
 * (record.* or top-level). Returns false on a malformed expression.
 */
export function evaluateExpression(expression: string, context: Record<string, unknown>): boolean {
  if (!expression || typeof expression !== "string") return true;
  const m = expression.match(/^\s*([a-zA-Z0-9_.]+)\s*(==|!=|>=|<=|>|<|contains)\s*(.+?)\s*$/);
  if (!m) return false;
  const [, left, op, rawRight] = m;
  const actual = resolvePath(context, left!);
  const right = stripQuotes(rawRight!);
  switch (op) {
    case "==":
      return String(actual ?? "") === right;
    case "!=":
      return String(actual ?? "") !== right;
    case ">":
      return Number(actual) > Number(right);
    case "<":
      return Number(actual) < Number(right);
    case ">=":
      return Number(actual) >= Number(right);
    case "<=":
      return Number(actual) <= Number(right);
    case "contains":
      return String(actual ?? "").toLowerCase().includes(right.toLowerCase());
    default:
      return false;
  }
}

function stripQuotes(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

/** Find the entry trigger node in a graph (data.type === "trigger"). */
export function findTriggerNode(graph: WorkflowGraph): WorkflowNode | undefined {
  return graph.nodes.find((n) => n.type === "trigger" || (n.data?.type as string) === "trigger");
}

/** Effective node type, preferring data.type (graph json) over the rf node.type. */
export function effectiveNodeType(node: WorkflowNode): string {
  return (node.data?.type as string) || node.type;
}

/** Outgoing edges from a node, optionally filtered by sourceHandle. */
export function outgoingEdges(graph: WorkflowGraph, nodeId: string, handle?: string): WorkflowEdge[] {
  return graph.edges.filter(
    (e) => e.source === nodeId && (handle === undefined || (e.sourceHandle ?? "out") === handle),
  );
}

/** Next node id(s) from a node along a given handle. */
export function nextNodeIds(graph: WorkflowGraph, nodeId: string, handle?: string): string[] {
  return outgoingEdges(graph, nodeId, handle).map((e) => e.target);
}

export function getNode(graph: WorkflowGraph, nodeId: string | null | undefined): WorkflowNode | undefined {
  if (!nodeId) return undefined;
  return graph.nodes.find((n) => n.id === nodeId);
}

/** Coerce arbitrary stored json into a WorkflowGraph with safe defaults. */
export function asGraph(value: unknown): WorkflowGraph {
  const g = (value ?? {}) as Partial<WorkflowGraph>;
  return {
    nodes: Array.isArray(g.nodes) ? (g.nodes as WorkflowNode[]) : [],
    edges: Array.isArray(g.edges) ? (g.edges as WorkflowEdge[]) : [],
  };
}

export function emptyGraph(): WorkflowGraph {
  return { nodes: [], edges: [] };
}

/** Success rate over a set of run statuses (COMPLETED / total finished). */
export function successRate(runs: { status: string }[]): number | null {
  const finished = runs.filter((r) => r.status === "COMPLETED" || r.status === "FAILED");
  if (finished.length === 0) return null;
  const ok = finished.filter((r) => r.status === "COMPLETED").length;
  return Math.round((ok / finished.length) * 100);
}
