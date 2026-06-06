/*
 * reindex-tenant.ts - rebuild the SearchIndex table for a tenant from scratch
 * (Sprint 9). Clears every SearchIndex row then re-derives one per indexable
 * entity (leads, deals, contacts, companies, activities, ready files, email
 * messages) using the same reindex() helper the CRUD paths use.
 *
 * Usage:
 *   tsx scripts/reindex-tenant.ts --slug acme
 *
 * Binds a PrismaClient directly to tenant_<slug> via DATABASE_URL (same approach
 * as seed-tenant.ts). Idempotent: it truncates SearchIndex first, so re-running
 * always produces the same result.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { PrismaClient } from "../src/lib/db/generated/tenant";
import { reindex } from "../src/lib/search";

type Args = { slug: string };

function fail(msg: string): never {
  console.error(`\n[reindex-tenant] ERROR: ${msg}\n`);
  process.exit(1);
}

function parseArgs(argv: string[]): Args {
  const out: Partial<Args> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--slug") out.slug = argv[++i];
  }
  if (!out.slug) fail("Missing --slug. Usage: tsx scripts/reindex-tenant.ts --slug acme");
  if (!/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(out.slug!)) {
    fail(`Invalid slug "${out.slug}". Use lowercase letters, digits, and hyphens.`);
  }
  return out as Args;
}

function schemaNameForSlug(slug: string): string {
  return `tenant_${slug.replace(/-/g, "_")}`;
}

function connectionForSchema(schema: string): string {
  const base = process.env.DATABASE_URL;
  if (!base) fail("DATABASE_URL is not set; cannot build a tenant connection.");
  const url = new URL(base!);
  url.searchParams.set("schema", schema);
  return url.toString();
}

async function main() {
  const { slug } = parseArgs(process.argv.slice(2));
  const schema = schemaNameForSlug(slug);
  const db = new PrismaClient({ datasources: { db: { url: connectionForSchema(schema) } } });

  try {
    console.log(`[reindex-tenant] rebuilding SearchIndex for ${schema}`);
    await db.searchIndex.deleteMany({});

    const [leads, deals, contacts, companies, activities, files, emails, tasks, projects, taskComments] = await Promise.all([
      db.lead.findMany({ select: { id: true } }),
      db.deal.findMany({ select: { id: true } }),
      db.contact.findMany({ select: { id: true } }),
      db.company.findMany({ select: { id: true } }),
      db.crmActivity.findMany({ select: { id: true } }),
      db.file.findMany({ where: { status: { not: "DELETED" } }, select: { id: true } }),
      db.emailMessage.findMany({ select: { id: true } }),
      db.task.findMany({ where: { deletedAt: null }, select: { id: true } }),
      db.project.findMany({ select: { id: true } }),
      db.taskComment.findMany({ select: { id: true } }),
    ]);

    for (const r of leads) await reindex(db, "LEAD", r.id);
    for (const r of deals) await reindex(db, "DEAL", r.id);
    for (const r of contacts) await reindex(db, "CONTACT", r.id);
    for (const r of companies) await reindex(db, "COMPANY", r.id);
    for (const r of activities) await reindex(db, "ACTIVITY", r.id);
    for (const r of files) await reindex(db, "FILE", r.id);
    for (const r of emails) await reindex(db, "EMAIL_MESSAGE", r.id);
    for (const r of tasks) await reindex(db, "TASK", r.id);
    for (const r of projects) await reindex(db, "PROJECT", r.id);
    for (const r of taskComments) await reindex(db, "TASK_COMMENT", r.id);

    const total = await db.searchIndex.count();
    console.log(
      `[reindex-tenant] done. leads=${leads.length} deals=${deals.length} ` +
        `contacts=${contacts.length} companies=${companies.length} ` +
        `activities=${activities.length} files=${files.length} emails=${emails.length} ` +
        `tasks=${tasks.length} projects=${projects.length} taskComments=${taskComments.length} ` +
        `=> searchIndex rows=${total}`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error("[reindex-tenant] fatal", err);
  process.exit(1);
});
