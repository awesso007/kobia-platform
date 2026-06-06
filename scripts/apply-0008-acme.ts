/*
 * One-off: apply tenant migration 0008_files to tenant_acme via raw SQL with
 * SET search_path (Sprint 8). The migration is additive and uses IF NOT EXISTS
 * guards, so re-running is safe. ALTER TYPE ... ADD VALUE cannot run inside a
 * transaction, so each statement is executed on its own with $executeRawUnsafe.
 *
 * Usage: tsx scripts/apply-0008-acme.ts [--slug acme]
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

  const sqlPath = join(process.cwd(), "prisma/tenant/migrations/0008_files/migration.sql");
  const sql = readFileSync(sqlPath, "utf8");
  const statements = splitStatements(sql);

  const db = new PrismaClient({ datasources: { db: { url: connectionForSchema(schema) } } });
  try {
    await db.$executeRawUnsafe(`SET search_path TO "${schema}"`);
    console.log(`[apply-0008] search_path=${schema}; applying ${statements.length} statements`);
    for (const stmt of statements) {
      const label = stmt.replace(/\s+/g, " ").slice(0, 70);
      try {
        await db.$executeRawUnsafe(stmt);
        console.log(`  ok: ${label}`);
      } catch (err) {
        const msg = String((err as Error).message ?? err);
        // Idempotent re-runs: tolerate "already exists" on enums/tables/indexes/columns.
        if (/already exists/i.test(msg)) {
          console.log(`  skip (exists): ${label}`);
        } else {
          throw err;
        }
      }
    }
    console.log("[apply-0008] done.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error("[apply-0008] FAILED:", err);
  process.exit(1);
});
