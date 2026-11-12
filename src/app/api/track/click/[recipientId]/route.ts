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
import { getTenantPrisma } from "@/lib/db/tenant-prisma";
import { activeWebhookTenantSchema } from "@/lib/security/legacy-webhook-tenant";
import { verifyLegacyTrackingCapability } from "@/lib/security/legacy-tracking-capability";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { recipientId: string } }) {
  const capability = verifyLegacyTrackingCapability(
    req.nextUrl.searchParams.get("cap"), "CLICK", params.recipientId,
  );
  if (!capability || !capability.url)
    return NextResponse.json({ error: "Tracking link unavailable" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  const schema = await activeWebhookTenantSchema(capability.t);
  if (!schema)
    return NextResponse.json({ error: "Tracking link unavailable" }, { status: 404, headers: { "Cache-Control": "no-store" } });

  if (schema) {
    try {
      const db = getTenantPrisma(schema);
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

  return NextResponse.redirect(capability.url, { status: 302, headers: { "Cache-Control": "no-store" } });
}
