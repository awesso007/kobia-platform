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
import { getTenantPrisma } from "@/lib/db/tenant-prisma";
import { activeWebhookTenantSchema } from "@/lib/security/legacy-webhook-tenant";
import { verifyLegacyTrackingCapability } from "@/lib/security/legacy-tracking-capability";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 1x1 transparent GIF.
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

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
  const capability = verifyLegacyTrackingCapability(
    req.nextUrl.searchParams.get("cap"), "OPEN", params.recipientId,
  );
  // Pixels remain visually harmless, but do not mutate any recipient without
  // a signed capability bound to its exact tenant and identity.
  const schema = capability ? await activeWebhookTenantSchema(capability.t) : null;
  if (schema) {
    try {
      const db = getTenantPrisma(schema);
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
