/*
 * tenant-prisma.ts - per-tenant Prisma client routing (schema-per-tenant).
 *
 * Given a tenant's schema name (tenant_<slug>), returns a PrismaClient whose
 * connection targets that Postgres schema via ?schema=. Clients are cached per
 * schema for the lifetime of the server process (Neon pooled connection at
 * runtime; provisioning/migrations use DIRECT_URL separately).
 *
 * NOTE: the generated tenant client is produced by the schema split (Decision
 * 1a, see CONFLICTS.md). Until prisma/tenant generates its client, this module
 * falls back to the default @prisma/client so the app still compiles. Swap the
 * import to the generated tenant client once the split lands.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { PrismaClient } from "@prisma/client";

const clientCache = new Map<string, PrismaClient>();

/** Build a connection string for the runtime (pooled) DB scoped to a schema. */
function connectionForSchema(schema: string): string {
  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error("DATABASE_URL is not set; cannot build a tenant connection.");
  }
  const url = new URL(base);
  url.searchParams.set("schema", schema);
  return url.toString();
}

/**
 * Return a PrismaClient bound to the given tenant schema. Cached per schema.
 */
export function getTenantPrisma(schemaName: string): PrismaClient {
  if (!/^tenant_[a-z0-9_]+$/.test(schemaName)) {
    throw new Error(`Refusing to bind to unsafe schema name: ${schemaName}`);
  }
  const cached = clientCache.get(schemaName);
  if (cached) return cached;

  const client = new PrismaClient({
    datasources: { db: { url: connectionForSchema(schemaName) } },
  });
  clientCache.set(schemaName, client);
  return client;
}

/** Map a tenant slug to its schema name. */
export function schemaNameForSlug(slug: string): string {
  return `tenant_${slug.replace(/-/g, "_")}`;
}
