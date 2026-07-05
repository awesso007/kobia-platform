/*
 * Apply tenant migration 0020_inventory (Sprint 20) to EVERY active tenant
 * schema. Reads the ACTIVE tenants from the platform registry, then runs the raw
 * SQL (SET search_path per schema) tolerating "already exists" so it is safe to
 * re-run. Mirrors scripts/apply-0020-acme.ts but loops over all tenants.
 *
 * Usage: tsx scripts/apply-migration-0020.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "../src/lib/db/generated/tenant";
import { PrismaClient as PlatformPrismaClient } from "../src/lib/db/generated/platform";

function connectionForSchema(schema: string): string {
  const base = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!base) throw new Error("DIRECT_URL/DATABASE_URL not set");
  const url = new URL(base);
  url.searchParams.set("schema", schema);
  return url.toString();
}

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

async function applyToSchema(schema: string, statements: string[]) {
  const db = new PrismaClient({ datasources: { db: { url: connectionForSchema(schema) } } });
  try {
    await db.$executeRawUnsafe(`SET search_path TO "${schema}"`);
    for (const stmt of statements) {
      try {
        await db.$executeRawUnsafe(stmt);
      } catch (err) {
        const msg = String((err as Error).message ?? err);
        if (!/already exists|duplicate/i.test(msg)) throw err;
      }
    }
  } finally {
    await db.$disconnect();
  }
}

async function main() {
  const sqlPath = join(process.cwd(), "prisma/tenant/migrations/0020_inventory/migration.sql");
  const statements = splitStatements(readFileSync(sqlPath, "utf8"));

  const platform = new PlatformPrismaClient();
  let tenants: { slug: string; schemaName: string }[] = [];
  try {
    tenants = await platform.tenantRegistry.findMany({
      where: { status: "ACTIVE" },
      select: { slug: true, schemaName: true },
    });
  } finally {
    await platform.$disconnect();
  }

  console.log(`[apply-migration-0020] applying to ${tenants.length} active tenant(s)`);
  for (const t of tenants) {
    try {
      await applyToSchema(t.schemaName, statements);
      console.log(`  ok: ${t.slug} (${t.schemaName})`);
    } catch (err) {
      console.error(`  FAILED: ${t.slug} (${t.schemaName})`, err);
      throw err;
    }
  }
  console.log("[apply-migration-0020] done.");
}

main().catch((err) => {
  console.error("[apply-migration-0020] FAILED:", err);
  process.exit(1);
});
