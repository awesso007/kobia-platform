/*
 * Click-tracking redirect (Sprint 13). Public, unauthenticated. Records a click
 * for the BroadcastRecipient (best-effort), then 302-redirects to the validated
 * `?url=` target. Tenant resolved from a validated `?t=<slug>` query param.
 * Only http(s) destinations are allowed to avoid an open-redirect to other
 * schemes.
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

function safeUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest, { params }: { params: { recipientId: string } }) {
  const target = safeUrl(req.nextUrl.searchParams.get("url"));
  const tenantSlug = sanitizeSlug(req.nextUrl.searchParams.get("t"));

  if (tenantSlug) {
    try {
      const db = getTenantPrisma(schemaNameForSlug(tenantSlug));
      const rcpt = await db.broadcastRecipient.findUnique({ where: { id: params.recipientId }, select: { id: true, status: true, clickedAt: true } });
      if (rcpt && rcpt.status !== "BOUNCED" && rcpt.status !== "UNSUBSCRIBED" && rcpt.status !== "FAILED") {
        await db.broadcastRecipient.update({
          where: { id: rcpt.id },
          data: { status: "CLICKED", clickedAt: rcpt.clickedAt ?? new Date() },
        });
      }
    } catch {
      // Tracking must never block the redirect.
    }
  }

  const dest = target ?? process.env.NEXT_PUBLIC_APP_URL ?? "/";
  return NextResponse.redirect(dest, { status: 302 });
}
