/*
 * platform.ts - cached accessor for the platform (public schema) Prisma client.
 *
 * The platform client holds cross-tenant tables (tenant_registry, billing_event).
 * It uses the default DATABASE_URL/DIRECT_URL and is safe to use from route
 * handlers and cron jobs (it carries no tenant scoping). Cached for the process
 * lifetime so we do not open a new pool per request.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { PrismaClient } from "@/lib/db/generated/platform";

declare global {
  var __kbPlatformClient: PrismaClient | undefined;
}

export function getPlatformDb(): PrismaClient {
  if (!global.__kbPlatformClient) {
    global.__kbPlatformClient = new PrismaClient();
  }
  return global.__kbPlatformClient;
}
