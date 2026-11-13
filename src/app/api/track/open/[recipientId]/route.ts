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
import { claimPublicSurfaceQuota } from "@/lib/security/public-surface-round53";
import { trustedPublicFormIp } from "@/lib/security/public-form-abuse";

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
  if (schema && capability) {
    try {
      const db = getTenantPrisma(schema);
      const trusted = (process.env.CHESS_PUBLIC_FORM_TRUSTED_IP_HEADER ?? "").toLowerCase().trim();
      await claimPublicSurfaceQuota(db, {
        tenant: capability.t, kind: "email_open", resource: params.recipientId,
        clientIp: trustedPublicFormIp(req.headers, trusted),
        rateKey: process.env.CHESS_PUBLIC_FORM_RATE_HASH_KEY ?? "",
      });
      // Atomic conditional: no stale status read can override opt-out.
      await db.broadcastRecipient.updateMany({
        where: { id: params.recipientId, status: { in: ["SENT", "DELIVERED"] },
          openedAt: null },
        data: { status: "OPENED", openedAt: new Date() },
      });
    } catch {
      // Telemetry failures never reveal a recipient or break the pixel.
    }
  }

  return pixelResponse();
}
