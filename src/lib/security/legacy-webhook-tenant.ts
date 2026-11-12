/**
 * Legacy signed callback tenant boundary. Validating the tenant selector does
 * NOT authenticate a callback: the route first verifies the vendor signature
 * over the exact callback URL and parameters, then checks the live registry.
 */
import { getPlatformDb } from "@/lib/db/platform";
import { schemaNameForSlug } from "@/lib/db/tenant-prisma";

export function validatedWebhookTenantSlug(value: string | null): string | null {
  if (!value) return null;
  return /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(value) ? value : null;
}

export function registeredWebhookSchema(
  slug: string,
  row: { status: string; schemaName: string } | null,
): string | null {
  const expected = schemaNameForSlug(slug);
  return row?.status === "ACTIVE" && row.schemaName === expected ? expected : null;
}

export async function activeWebhookTenantSchema(slug: string): Promise<string | null> {
  if (!validatedWebhookTenantSlug(slug)) return null;
  const registry = await getPlatformDb().tenantRegistry.findUnique({
    where: { slug }, select: { status: true, schemaName: true },
  });
  return registeredWebhookSchema(slug, registry);
}
