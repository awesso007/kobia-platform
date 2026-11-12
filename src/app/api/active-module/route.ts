import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { setActiveModule, type ModuleKey } from "@/lib/active-module";
import { getPlatformDb } from "@/lib/db/platform";
import { getTenantPrisma, schemaNameForSlug } from "@/lib/db/tenant-prisma";
import { assertMutationOrigin } from "@/lib/chess/request-security";
import { moduleTenantAuthorized, safeHistoricalTenantSlug } from "@/lib/security/historical-mutation-boundaries";

const VALID: ModuleKey[] = ["accounting", "mortgage", "realestate"];
export const dynamic = "force-dynamic";

/** Module preference never grants tenant access; only ACTIVE members may set it. */
export async function POST(req: Request) {
  try { assertMutationOrigin(req); }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }
  const clerkUserId = auth().userId;
  if (!clerkUserId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { module?: unknown; tenantSlug?: unknown };
  const tenantSlug = safeHistoricalTenantSlug(body.tenantSlug);
  if (!tenantSlug) return NextResponse.json({ error: "Invalid tenant" }, { status: 400 });
  if (typeof body.module !== "string" || !VALID.includes(body.module as ModuleKey))
    return NextResponse.json({ error: "Invalid module" }, { status: 400 });

  try {
    const tenant = await getPlatformDb().tenantRegistry.findUnique({
      where: { slug: tenantSlug }, select: { status: true, schemaName: true },
    });
    if (!tenant || tenant.status !== "ACTIVE" || tenant.schemaName !== schemaNameForSlug(tenantSlug)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const member = await getTenantPrisma(tenant!.schemaName).membership.findUnique({
      where: { clerkUserId }, select: { status: true },
    });
    if (!moduleTenantAuthorized(tenantSlug, tenant, member))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    await setActiveModule(tenantSlug, body.module as ModuleKey);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Tenant verification unavailable" }, { status: 503 });
  }
}
