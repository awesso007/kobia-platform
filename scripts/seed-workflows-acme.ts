/*
 * seed-workflows-acme.ts - populate a tenant schema with Sprint 18 workflow
 * starter data. Idempotent: workflows are found by name, runs by
 * (workflowId, status) up to the expected count. Re-running does not duplicate.
 *
 * Seeds:
 *   - "Lead Welcome" workflow (ACTIVE, entryTrigger LEAD_CREATED)
 *       trigger -> send_email -> delay 1440min -> create_task
 *   - "Deal Won Celebration" workflow (ACTIVE, entryTrigger DEAL_WON)
 *       trigger -> create_notification -> add_tag
 *   - 2 WorkflowRun rows for Lead Welcome (1 COMPLETED, 1 WAITING) with step logs
 *
 * Usage:
 *   tsx scripts/seed-workflows-acme.ts --slug acme
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { PrismaClient } from "../src/lib/db/generated/tenant";
import type { WorkflowGraph } from "../src/lib/workflows/workflow-utils";

function fail(msg: string): never {
  console.error(`\n[seed-workflows] ERROR: ${msg}\n`);
  process.exit(1);
}

function parseSlug(argv: string[]): string {
  let slug: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--slug") slug = argv[++i];
  }
  return slug ?? "acme";
}

function schemaNameForSlug(slug: string): string {
  return `tenant_${slug.replace(/-/g, "_")}`;
}

function connectionForSchema(schema: string): string {
  const base = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!base) fail("DIRECT_URL/DATABASE_URL not set");
  const url = new URL(base);
  url.searchParams.set("schema", schema);
  return url.toString();
}

const leadWelcomeGraph: WorkflowGraph = {
  nodes: [
    { id: "n_trigger", type: "trigger", data: {}, position: { x: 80, y: 120 } },
    {
      id: "n_email",
      type: "action.send_email",
      data: {
        to: "{{lead.email}}",
        subject: "Welcome to Acme",
        body: "Hi {{lead.firstName}}, thanks for reaching out.",
      },
      position: { x: 320, y: 120 },
    },
    { id: "n_delay", type: "logic.delay", data: { durationMinutes: "1440" }, position: { x: 560, y: 120 } },
    {
      id: "n_task",
      type: "action.create_task",
      data: { title: "Follow up on new lead", dueInDays: "2" },
      position: { x: 800, y: 120 },
    },
  ],
  edges: [
    { id: "e1", source: "n_trigger", target: "n_email" },
    { id: "e2", source: "n_email", target: "n_delay" },
    { id: "e3", source: "n_delay", target: "n_task" },
  ],
};

const dealWonGraph: WorkflowGraph = {
  nodes: [
    { id: "n_trigger", type: "trigger", data: {}, position: { x: 80, y: 120 } },
    {
      id: "n_notify",
      type: "action.create_notification",
      data: { message: "Deal won: {{deal.name}}" },
      position: { x: 320, y: 120 },
    },
    { id: "n_tag", type: "action.add_tag", data: { tag: "won" }, position: { x: 560, y: 120 } },
  ],
  edges: [
    { id: "e1", source: "n_trigger", target: "n_notify" },
    { id: "e2", source: "n_notify", target: "n_tag" },
  ],
};

async function upsertWorkflow(
  db: PrismaClient,
  name: string,
  description: string,
  entryTriggerType: string,
  graph: WorkflowGraph
): Promise<string> {
  const existing = await db.workflow.findFirst({ where: { name } });
  if (existing) {
    await db.workflow.update({
      where: { id: existing.id },
      data: { description, entryTriggerType, graph: graph as unknown as object, status: "ACTIVE" },
    });
    return existing.id;
  }
  const created = await db.workflow.create({
    data: {
      name,
      description,
      entryTriggerType,
      graph: graph as unknown as object,
      status: "ACTIVE",
    },
  });
  return created.id;
}

async function ensureRuns(db: PrismaClient, workflowId: string) {
  const existingCount = await db.workflowRun.count({ where: { workflowId } });
  if (existingCount >= 2) return { created: 0 };

  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const twoDaysLater = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

  const completed = await db.workflowRun.create({
    data: {
      workflowId,
      status: "COMPLETED",
      startedAt: oneHourAgo,
      completedAt: new Date(oneHourAgo.getTime() + 5 * 60 * 1000),
      triggeredBy: { source: "seed", event: "LEAD_CREATED", lead: { email: "seed@example.com" } },
      context: { lead: { firstName: "Seed", email: "seed@example.com" } },
    },
  });
  await db.workflowStepLog.createMany({
    data: [
      {
        runId: completed.id,
        nodeId: "n_trigger",
        nodeType: "trigger",
        status: "SUCCESS",
        input: {},
        output: {},
        startedAt: oneHourAgo,
        completedAt: new Date(oneHourAgo.getTime() + 100),
      },
      {
        runId: completed.id,
        nodeId: "n_email",
        nodeType: "action.send_email",
        status: "SUCCESS",
        input: { to: "seed@example.com", subject: "Welcome to Acme" },
        output: { messageId: "seed-msg-1" },
        startedAt: new Date(oneHourAgo.getTime() + 200),
        completedAt: new Date(oneHourAgo.getTime() + 400),
      },
    ],
  });

  const waiting = await db.workflowRun.create({
    data: {
      workflowId,
      status: "WAITING",
      startedAt: new Date(now.getTime() - 5 * 60 * 1000),
      currentNodeId: "n_delay",
      resumeAt: twoDaysLater,
      triggeredBy: { source: "seed", event: "LEAD_CREATED", lead: { email: "waiting@example.com" } },
      context: { lead: { firstName: "Waiting", email: "waiting@example.com" } },
    },
  });
  await db.workflowStepLog.createMany({
    data: [
      {
        runId: waiting.id,
        nodeId: "n_trigger",
        nodeType: "trigger",
        status: "SUCCESS",
        input: {},
        output: {},
        startedAt: new Date(now.getTime() - 5 * 60 * 1000),
        completedAt: new Date(now.getTime() - 5 * 60 * 1000 + 100),
      },
      {
        runId: waiting.id,
        nodeId: "n_email",
        nodeType: "action.send_email",
        status: "SUCCESS",
        input: { to: "waiting@example.com", subject: "Welcome to Acme" },
        output: { messageId: "seed-msg-2" },
        startedAt: new Date(now.getTime() - 5 * 60 * 1000 + 200),
        completedAt: new Date(now.getTime() - 5 * 60 * 1000 + 400),
      },
      {
        runId: waiting.id,
        nodeId: "n_delay",
        nodeType: "logic.delay",
        status: "WAITING",
        input: { durationMinutes: 1440 },
        startedAt: new Date(now.getTime() - 5 * 60 * 1000 + 500),
        completedAt: null,
      },
    ],
  });
  return { created: 2 };
}

async function main() {
  const slug = parseSlug(process.argv.slice(2));
  const schema = schemaNameForSlug(slug);
  const db = new PrismaClient({ datasources: { db: { url: connectionForSchema(schema) } } });
  try {
    await db.$executeRawUnsafe(`SET search_path TO "${schema}"`);
    console.log(`[seed-workflows] search_path=${schema}`);

    const leadId = await upsertWorkflow(
      db,
      "Lead Welcome",
      "Welcome new leads: send an email, wait a day, then create a follow-up task.",
      "LEAD_CREATED",
      leadWelcomeGraph
    );
    console.log(`  ok: workflow Lead Welcome (${leadId})`);

    const dealId = await upsertWorkflow(
      db,
      "Deal Won Celebration",
      "Notify the owner and tag the deal when it is won.",
      "DEAL_WON",
      dealWonGraph
    );
    console.log(`  ok: workflow Deal Won Celebration (${dealId})`);

    const runResult = await ensureRuns(db, leadId);
    console.log(`  ok: runs (created ${runResult.created})`);

    const wfCount = await db.workflow.count();
    const runCount = await db.workflowRun.count();
    const stepCount = await db.workflowStepLog.count();
    console.log(`[seed-workflows] done: workflows=${wfCount} runs=${runCount} steps=${stepCount}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
