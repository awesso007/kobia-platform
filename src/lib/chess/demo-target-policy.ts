import type { PrismaClient } from "@/lib/db/generated/platform";
import { CHESS_DEMO_SCHEMA, CHESS_DEMO_SLUG } from "./demo-mode";

export type DemoInventory = {
  publicTables: string[];
  tenantSchemas: string[];
  registrations: { slug: string; schemaName: string; plan: string; status: string }[];
};

/** Reject unrelated legacy tables, tenant schemas and registrations before DDL. */
export function assertChessDemoInventorySafe(inventory: DemoInventory): void {
  const knownPublic = new Set(["tenant_registry", "billing_event", "_prisma_migrations"]);
  if (inventory.publicTables.some(table => !knownPublic.has(table))) {
    throw new Error("Demo target has unrelated public tables; use a fresh Neon chess_demo database.");
  }
  if (inventory.tenantSchemas.some(schema => schema !== CHESS_DEMO_SCHEMA)) {
    throw new Error("Demo target contains other tenant schemas; refusing to migrate.");
  }
  if (inventory.registrations.some(r =>
    r.slug !== CHESS_DEMO_SLUG || r.schemaName !== CHESS_DEMO_SCHEMA ||
    r.plan !== "DEMO" || r.status !== "ACTIVE"
  )) {
    throw new Error("Demo target contains a non-demo or inactive tenant registry entry.");
  }
}

/** System catalog reads are safe even before platform migrations exist. */
export async function assertIsolatedChessDemoDatabase(db: PrismaClient): Promise<void> {
  const [tables, schemas] = await Promise.all([
    db.$queryRaw<Array<{table_name:string}>>`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`,
    db.$queryRaw<Array<{schema_name:string}>>`SELECT schema_name FROM information_schema.schemata`,
  ]);
  const publicTables = tables.map(t=>t.table_name);
  const tenantSchemas = schemas.map(s=>s.schema_name).filter(s=>s.startsWith("tenant_"));
  assertChessDemoInventorySafe({ publicTables, tenantSchemas, registrations: [] });
  const registrations = publicTables.includes("tenant_registry")
    ? await db.tenantRegistry.findMany({
      select: { slug: true, schemaName: true, plan: true, status: true },
      take: 3,
    }) : [];
  assertChessDemoInventorySafe({ publicTables, tenantSchemas, registrations });
}
