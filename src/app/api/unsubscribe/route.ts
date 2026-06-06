/*
 * Public unsubscribe endpoint (Sprint 13). Unauthenticated. Accepts a POST with
 * { email, tenant, reason? } (tenant also accepted as `?t=` query for links),
 * upserts an Unsubscribe row, and marks any PENDING BroadcastRecipient rows for
 * that email UNSUBSCRIBED so a queued send skips them. Tenant resolved from a
 * validated slug, since unsubscribe state is per-tenant.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getTenantPrisma, schemaNameForSlug } from "@/lib/db/tenant-prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function sanitizeSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(slug) ? slug : null;
}

export async function POST(req: NextRequest) {
  let body: { email?: string; tenant?: string; reason?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const tenantSlug = sanitizeSlug(body.tenant) ?? sanitizeSlug(req.nextUrl.searchParams.get("t"));
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: "A valid email is required." }, { status: 400 });
  }
  if (!tenantSlug) {
    return NextResponse.json({ ok: false, error: "Missing tenant." }, { status: 400 });
  }

  try {
    const db = getTenantPrisma(schemaNameForSlug(tenantSlug));
    await db.unsubscribe.upsert({
      where: { email },
      update: { reason: body.reason?.trim() || null, source: "PORTAL" },
      create: { email, reason: body.reason?.trim() || null, source: "PORTAL" },
    });
    await db.broadcastRecipient.updateMany({
      where: { email: { equals: email, mode: "insensitive" }, status: "PENDING" },
      data: { status: "UNSUBSCRIBED" },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
