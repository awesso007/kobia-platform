/*
 * Customer portal login (Sprint 15, public). Unauthenticated, tenant resolved
 * from a validated `?t=<slug>` query (or `tenant` in the JSON body). Opens a
 * portal session for a matching Contact email and sets the opaque session token
 * as an httpOnly cookie. This is a lightweight email gate, not a password login
 * (see lib/helpdesk/portal.ts). POST to /api/portal/logout clears the cookie.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantPrisma, schemaNameForSlug } from "@/lib/db/tenant-prisma";
import { openPortalSession, PORTAL_COOKIE } from "@/lib/helpdesk/portal";

export const dynamic = "force-dynamic";

function sanitizeSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(slug) ? slug : null;
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  const tenant =
    sanitizeSlug(req.nextUrl.searchParams.get("t")) ??
    sanitizeSlug(req.nextUrl.searchParams.get("tenant")) ??
    sanitizeSlug(String(body.tenant ?? ""));
  if (!tenant) return NextResponse.json({ ok: false, error: "Unknown workspace." }, { status: 400 });

  const email = String(body.email ?? "").trim();
  if (!email) return NextResponse.json({ ok: false, error: "Email is required." }, { status: 400 });

  try {
    const db = getTenantPrisma(schemaNameForSlug(tenant));
    const session = await openPortalSession(db, email);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No account found for that email." },
        { status: 404 },
      );
    }
    const res = NextResponse.json({ ok: true });
    res.cookies.set(PORTAL_COOKIE, session.token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 14 * 24 * 60 * 60,
    });
    return res;
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
