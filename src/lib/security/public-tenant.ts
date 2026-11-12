/** A public embed may only address an ACTIVE registered tenant and exact schema. */
import { getPlatformDb } from "@/lib/db/platform";
import { schemaNameForSlug } from "@/lib/db/tenant-prisma";

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;
export function registeredPublicTenantSchema(
  slug: string, row: { status: string; schemaName: string } | null,
): string | null {
  if (!SLUG.test(slug)) return null;
  const expected = schemaNameForSlug(slug);
  return row?.status === "ACTIVE" && row.schemaName === expected ? expected : null;
}
export async function activePublicTenantSchema(slug: string): Promise<string | null> {
  if (!SLUG.test(slug)) return null;
  const row = await getPlatformDb().tenantRegistry.findUnique({
    where: { slug }, select: { status: true, schemaName: true },
  });
  return registeredPublicTenantSchema(slug, row);
}
