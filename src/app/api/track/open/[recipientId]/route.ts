/*
 * Open-tracking pixel (Sprint 13). Public, unauthenticated. Returns a 1x1
 * transparent GIF and, best-effort, marks the BroadcastRecipient OPENED (only
 * advancing forward from SENT/DELIVERED so a later open does not overwrite a
 * CLICKED state). Tenant resolved from a validated `?t=<slug>` query param,
 * since a recipientId is only unique within a tenant schema.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getTenantPrisma, schemaNameForSlug } from "@/lib/db/tenant-prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 1x1 transparent GIF.
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

function sanitizeSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(slug) ? slug : null;
}

function pixelResponse(): NextResponse {
  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Content-Length": String(PIXEL.length),
    },
  });
}

export async function GET(req: NextRequest, { params }: { params: { recipientId: string } }) {
  const tenantSlug = sanitizeSlug(req.nextUrl.searchParams.get("t"));
  if (tenantSlug) {
    try {
      const db = getTenantPrisma(schemaNameForSlug(tenantSlug));
      const rcpt = await db.broadcastRecipient.findUnique({ where: { id: params.recipientId }, select: { id: true, status: true, openedAt: true } });
      if (rcpt && (rcpt.status === "SENT" || rcpt.status === "DELIVERED")) {
        await db.broadcastRecipient.update({
          where: { id: rcpt.id },
          data: { status: "OPENED", openedAt: rcpt.openedAt ?? new Date() },
        });
      }
    } catch {
      // Tracking must never fail the pixel response.
    }
  }
  return pixelResponse();
}
