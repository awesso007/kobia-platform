/*
 * One-off: apply tenant migration 0013_marketing to tenant_acme via raw SQL with
 * SET search_path (Sprint 13). Adds Segment, Broadcast, BroadcastRecipient,
 * Campaign, CampaignStep, CampaignEnrollment, LandingPage, LandingPageView,
 * Unsubscribe, plus new marketing enums and two new SearchEntityType values.
 * Statements are mostly guarded (IF NOT EXISTS) or tolerate "already exists" per
 * statement on re-run, the same approach as apply-0012-acme.ts.
 *
 * Usage: tsx scripts/apply-0013-acme.ts [--slug acme]
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "../src/lib/db/generated/tenant";

function schemaNameForSlug(slug: string): string {
  return `tenant_${slug.replace(/-/g, "_")}`;
}

function connectionForSchema(schema: string): string {
  const base = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!base) throw new Error("DIRECT_URL/DATABASE_URL not set");
  const url = new URL(base);
  url.searchParams.set("schema", schema);
  return url.toString();
}

/** Split SQL into statements, ignoring -- comment lines and blank lines. */
function splitStatements(sql: string): string[] {
  const noComments = sql
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");
  return noComments
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function main() {
  const slugIdx = process.argv.indexOf("--slug");
  const slug = (slugIdx >= 0 ? process.argv[slugIdx + 1] : "acme") ?? "acme";
  const schema = schemaNameForSlug(slug);

  const sqlPath = join(process.cwd(), "prisma/tenant/migrations/0013_marketing/migration.sql");
  const sql = readFileSync(sqlPath, "utf8");
  const statements = splitStatements(sql);

  const db = new PrismaClient({ datasources: { db: { url: connectionForSchema(schema) } } });
  try {
    await db.$executeRawUnsafe(`SET search_path TO "${schema}"`);
    console.log(`[apply-0013] search_path=${schema}; applying ${statements.length} statements`);
    for (const stmt of statements) {
      const label = stmt.replace(/\s+/g, " ").slice(0, 70);
      try {
        await db.$executeRawUnsafe(stmt);
        console.log(`  ok: ${label}`);
      } catch (err) {
        const msg = String((err as Error).message ?? err);
        if (/already exists|duplicate/i.test(msg)) {
          console.log(`  skip (exists): ${label}`);
        } else {
          throw err;
        }
      }
    }
    console.log("[apply-0013] done.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error("[apply-0013] FAILED:", err);
  process.exit(1);
});
