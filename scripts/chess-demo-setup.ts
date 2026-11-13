/**
 * Round 18 Codespaces demo: separate fictional CHESS tenant, never live data.
 * Run: npm run demo:setup after configuring .env.local and npm ci.
 * The script checks every safety precondition BEFORE running migrations.
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import {
  CHESS_DEMO_SCHEMA, CHESS_DEMO_SLUG, validateChessDemoEnvironment,
} from "../src/lib/chess/demo-mode";
import { registerChessDemoTenant, setupAndVerifyChessDemoFixtures } from "../src/lib/chess/demo-setup-core";
import { assertIsolatedChessDemoDatabase } from "../src/lib/chess/demo-target-policy";

const { databaseUrl } = validateChessDemoEnvironment(process.env);
process.env.DIRECT_URL = databaseUrl;
const prismaCli = resolve("node_modules/prisma/build/index.js");

function migrate(schemaFile: string, scopedUrl = databaseUrl): void {
  execFileSync(process.execPath, [prismaCli, "migrate", "deploy", "--schema=" + schemaFile], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: scopedUrl, DIRECT_URL: scopedUrl },
  });
}


async function main() {
  const { PrismaClient: PlatformClient } = await import("../src/lib/db/generated/platform");
  const platform = new PlatformClient({ datasources: { db: { url: databaseUrl } } });
  try {
    // Inspect target database BEFORE DDL. Refuse legacy data and other tenants.
    await assertIsolatedChessDemoDatabase(platform);
    migrate("prisma/platform/schema.prisma");
    // Fixed schema identifier: no user interpolation in CREATE SCHEMA.
    await platform.$executeRawUnsafe('CREATE SCHEMA IF NOT EXISTS "tenant_chess_demo"');
    const scopedMigrationUrl = new URL(databaseUrl);
    scopedMigrationUrl.searchParams.set("schema", CHESS_DEMO_SCHEMA);
    migrate("prisma/tenant/schema.prisma", scopedMigrationUrl.toString());
    await registerChessDemoTenant(platform);
  } finally {
    await platform.$disconnect();
  }

  const { PrismaClient: TenantClient } = await import("../src/lib/db/generated/tenant");
  const schemaUrl = new URL(databaseUrl);
  schemaUrl.searchParams.set("schema", CHESS_DEMO_SCHEMA);
  const db = new TenantClient({ datasources: { db: { url: schemaUrl.toString() } } });
  try {
    const fixture = await setupAndVerifyChessDemoFixtures(db);
    console.log("[demo:setup] Verified isolated fixture:", JSON.stringify(fixture));
    console.log("FICTIONAL demo seeded: 1 tenant, 8 business units, 3 staff, 5 clients.");
    console.log("All external financial and regulated integrations remain OFF.");
    console.log("Sign in at /chess-demo/login with the verified CHESS_DEMO_OWNER_EMAIL");
    console.log("then visit /app/overview and /app/demo for the guided tour.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("[demo:setup] Failed safely:", error);
  process.exitCode = 1;
});
