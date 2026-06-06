/*
 * get-tenant-db.ts - request-scoped tenant DB resolver.
 *
 * Reads the active tenant's schema name from request headers (set by
 * middleware: x-tenant-schema / x-tenant-id) and returns a PrismaClient bound
 * to that schema. Hard-fails if no tenant is resolved (caller maps to 403).
 *
 * Sprint 1 status: middleware sets these headers only once tenant resolution is
 * wired (Decision 2, see CONFLICTS.md). Until then this throws NoTenantError,
 * which callers should translate to a 403. No CRM data path depends on it yet.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { headers } from "next/headers";
import type { PrismaClient } from "@/lib/db/generated/tenant";
import { getTenantPrisma } from "./tenant-prisma";

export class NoTenantError extends Error {
  constructor() {
    super("No active tenant for this request.");
    this.name = "NoTenantError";
  }
}

export type TenantContext = {
  tenantId: string;
  schemaName: string;
  db: PrismaClient;
};

/**
 * Resolve the current request's tenant context. Throws NoTenantError if the
 * middleware did not attach a tenant (caller returns 403).
 */
export function getTenantDb(): TenantContext {
  const h = headers();
  const tenantId = h.get("x-tenant-id");
  const schemaName = h.get("x-tenant-schema");

  if (!tenantId || !schemaName) {
    throw new NoTenantError();
  }

  return { tenantId, schemaName, db: getTenantPrisma(schemaName) };
}
