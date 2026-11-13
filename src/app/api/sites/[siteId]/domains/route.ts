import { withAuditedHistoricalMutation } from "@/lib/chess/historical-mutation-response-audit-round57";
import {withAuditedHistoricalGet} from "@/lib/chess/historical-get-response-audit";
/*
 * Site domains API (Sprint 17, authenticated). GET lists a site's custom
 * domains; POST adds one (generating a verification token); DELETE removes one
 * by id. Guarded by RBAC, tenant via getTenantDb().
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError } from "@/lib/rbac/require-permission";
import { listDomains } from "@/lib/sites/queries";
import { addDomain, deleteDomain } from "@/lib/sites/mutations";
import { isValidDomain } from "@/lib/sites/site-utils";

import { siteDomainBelongsToSite } from "@/lib/security/historical-resource-scope";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

async function historicalAuditedGet(_req: NextRequest, { params }: { params: { siteId: string } }) {
  try {
    await requirePermission("record:read");
    const { db } = getTenantDb();
    const domains = await listDomains(db, params.siteId);
    return NextResponse.json({ ok: true, domains });
  } catch (err) {
    return fail(err);
  }
}

async function POSTOriginal(req: NextRequest, { params }: { params: { siteId: string } }) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  try {
    await requirePermission("record:update");
    const domain = String(body.domain ?? "").trim().toLowerCase();
    if (!isValidDomain(domain)) return NextResponse.json({ ok: false, error: "Invalid domain." }, { status: 400 });
    const { db } = getTenantDb();
    const id = await addDomain(db, params.siteId, domain);
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}

async function DELETEOriginal(req: NextRequest, { params }: { params: { siteId: string } }) {
  try {
    await requirePermission("record:update");
    const domainId = req.nextUrl.searchParams.get("domainId") ?? "";
    if (!domainId) return NextResponse.json({ ok: false, error: "domainId is required." }, { status: 400 });
    const { db } = getTenantDb();
    if (!await siteDomainBelongsToSite(db, params.siteId, domainId))
      return NextResponse.json({ ok: false, error: "Domain not found." }, { status: 404 });
    await deleteDomain(db, domainId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}

export const GET=withAuditedHistoricalGet("sites/[siteId]/domains",historicalAuditedGet);

export const POST = withAuditedHistoricalMutation("sites/[siteId]/domains", "POST", POSTOriginal);

export const DELETE = withAuditedHistoricalMutation("sites/[siteId]/domains", "DELETE", DELETEOriginal);
