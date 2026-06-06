/*
 * provision-tenant.ts - schema-per-tenant provisioning (Sprint 1 foundations).
 *
 * Given a slug (and optional Clerk org id), this script:
 *   1. Validates env (DIRECT_URL required for DDL + migrations).
 *   2. Creates the Postgres schema tenant_<slug> (idempotent).
 *   3. Runs the tenant Prisma migrations against that schema.
 *   4. Inserts / upserts the tenant registry row in public.
 *
 * Usage:
 *   tsx scripts/provision-tenant.ts --slug acme [--clerk-org org_123] [--plan FREE]
 *
 * IMPORTANT: this script intentionally FAILS FAST and does NOT invent
 * credentials. It requires DIRECT_URL (a non-pooled Neon connection) because
 * CREATE SCHEMA and prisma migrate deploy cannot run reliably through the Neon
 * pooler. It also requires the tenant Prisma schema to exist at
 * prisma/tenant/schema.prisma (produced by the schema split - blocked on
 * Decision 1a in CONFLICTS.md). Until both are present it exits with guidance.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const TENANT_SCHEMA_PATH = path.join("prisma", "tenant", "schema.prisma");
const PLATFORM_SCHEMA_PATH = path.join("prisma", "platform", "schema.prisma");

type Args = { slug: string; clerkOrg?: string; plan: string };

function parseArgs(argv: string[]): Args {
  const out: Partial<Args> = { plan: "FREE" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--slug") out.slug = argv[++i];
    else if (a === "--clerk-org") out.clerkOrg = argv[++i];
    else if (a === "--plan") out.plan = argv[++i];
  }
  if (!out.slug) {
    fail("Missing --slug. Usage: tsx scripts/provision-tenant.ts --slug acme [--clerk-org org_x] [--plan FREE]");
  }
  if (!/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(out.slug!)) {
    fail(`Invalid slug "${out.slug}". Use lowercase letters, digits, and hyphens (Postgres-schema-safe).`);
  }
  return out as Args;
}

function fail(msg: string): never {
  console.error(`\n[provision-tenant] ERROR: ${msg}\n`);
  process.exit(1);
}

function requireEnv(): { directUrl: string } {
  const directUrl = process.env.DIRECT_URL;
  if (!directUrl) {
    fail(
      [
        "DIRECT_URL is not set. Schema creation and migrations need a DIRECT",
        "(non-pooled) Neon connection. Add to .env.local (do NOT commit real values):",
        "",
        '  DIRECT_URL="postgresql://<user>:<pass>@<project>.<region>.aws.neon.tech/<db>?sslmode=require"',
        "",
        "Get it from the Neon dashboard -> Connection details -> turn OFF",
        '"Pooled connection". The pooled DATABASE_URL stays as-is for the app.',
      ].join("\n"),
    );
  }
  return { directUrl };
}

function schemaName(slug: string): string {
  return `tenant_${slug.replace(/-/g, "_")}`;
}

async function createSchema(directUrl: string, schema: string): Promise<void> {
  // Use a short-lived PrismaClient bound to the direct connection to run DDL.
  // No `pg` dependency needed; Prisma ships its own driver.
  const { PrismaClient } = await import("@prisma/client");
  const client = new PrismaClient({ datasources: { db: { url: directUrl } } });
  try {
    // Identifier is validated by the slug regex above; safe to interpolate.
    await client.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
    console.log(`[provision-tenant] schema ready: ${schema}`);
  } finally {
    await client.$disconnect();
  }
}

function runPlatformMigrations(directUrl: string): void {
  if (!existsSync(PLATFORM_SCHEMA_PATH)) {
    fail(
      [
        `Platform Prisma schema not found at ${PLATFORM_SCHEMA_PATH}.`,
        "It defines public.tenant_registry. Re-run after the schema split lands.",
      ].join("\n"),
    );
  }
  // Platform tables live in public; deploy with the direct connection as-is.
  console.log("[provision-tenant] running platform migrations (public) ...");
  execFileSync(
    "npx",
    ["prisma", "migrate", "deploy", "--schema", PLATFORM_SCHEMA_PATH],
    { stdio: "inherit", env: { ...process.env, DIRECT_URL: directUrl, DATABASE_URL: directUrl } },
  );
}

function runTenantMigrations(directUrl: string, schema: string): void {
  if (!existsSync(TENANT_SCHEMA_PATH)) {
    fail(
      [
        `Tenant Prisma schema not found at ${TENANT_SCHEMA_PATH}.`,
        "The platform/tenant schema split is pending Decision 1a (see CONFLICTS.md).",
        "Once prisma/tenant/schema.prisma exists, re-run this script.",
      ].join("\n"),
    );
  }
  // Point Prisma at the tenant schema by appending ?schema=tenant_<slug> to the
  // direct connection, then run migrate deploy.
  const url = appendSchema(directUrl, schema);
  console.log(`[provision-tenant] running migrations for ${schema} ...`);
  execFileSync(
    "npx",
    ["prisma", "migrate", "deploy", "--schema", TENANT_SCHEMA_PATH],
    { stdio: "inherit", env: { ...process.env, DIRECT_URL: url, DATABASE_URL: url } },
  );
}

function appendSchema(connStr: string, schema: string): string {
  const u = new URL(connStr);
  u.searchParams.set("schema", schema);
  return u.toString();
}

async function upsertRegistry(
  directUrl: string,
  slug: string,
  schema: string,
  clerkOrg: string | undefined,
  plan: string,
): Promise<void> {
  // Use the generated platform client (bound to public) for the registry row.
  const { PrismaClient } = await import("../src/lib/db/generated/platform");
  const client = new PrismaClient({ datasources: { db: { url: directUrl } } });
  try {
    await client.tenantRegistry.upsert({
      where: { slug },
      create: { slug, schemaName: schema, status: "ACTIVE", plan, clerkOrgId: clerkOrg ?? null },
      update: { schemaName: schema, plan, clerkOrgId: clerkOrg ?? null },
    });
    console.log(`[provision-tenant] registry row upserted for slug=${slug}`);
  } finally {
    await client.$disconnect();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { directUrl } = requireEnv();
  const schema = schemaName(args.slug);

  console.log(`[provision-tenant] provisioning tenant "${args.slug}" -> schema "${schema}"`);
  runPlatformMigrations(directUrl);
  await createSchema(directUrl, schema);
  runTenantMigrations(directUrl, schema);
  await upsertRegistry(directUrl, args.slug, schema, args.clerkOrg, args.plan);
  console.log(`[provision-tenant] done. Tenant "${args.slug}" is provisioned.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
