/*
 * Customer portal logout (Sprint 15, public). Deletes the session row for the
 * current portal cookie (when a tenant is resolvable) and clears the cookie.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantPrisma, schemaNameForSlug } from "@/lib/db/tenant-prisma";
import { closePortalSession, PORTAL_COOKIE } from "@/lib/helpdesk/portal";

export const dynamic = "force-dynamic";

function sanitizeSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(slug) ? slug : null;
}

export async function POST(req: NextRequest) {
  const tenant =
    sanitizeSlug(req.nextUrl.searchParams.get("t")) ?? sanitizeSlug(req.nextUrl.searchParams.get("tenant"));
  const token = req.cookies.get(PORTAL_COOKIE)?.value;
  if (tenant && token) {
    try {
      const db = getTenantPrisma(schemaNameForSlug(tenant));
      await closePortalSession(db, token);
    } catch {
      // best-effort; clear the cookie regardless
    }
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(PORTAL_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
