/*
 * tenant-prisma.ts - per-tenant Prisma client routing (schema-per-tenant).
 *
 * Given a tenant's schema name (tenant_<slug>), returns a PrismaClient whose
 * connection targets that Postgres schema via ?schema=. Clients are cached per
 * schema for the lifetime of the server process (Neon pooled connection at
 * runtime; provisioning/migrations use DIRECT_URL separately).
 *
 * Uses the dedicated tenant client generated from prisma/tenant/schema.prisma
 * (output: node_modules/.prisma/tenant-client), kept separate from the default
 * @prisma/client used by legacy accounting code.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { PrismaClient } from "@/lib/db/generated/tenant";

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
