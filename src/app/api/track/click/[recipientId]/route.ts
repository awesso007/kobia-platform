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
import { claimPublicSurfaceQuota } from "@/lib/security/public-surface-round53";
import { trustedPublicFormIp } from "@/lib/security/public-form-abuse";
import { recordSignedLegacyTracking } from "@/lib/security/legacy-marketing-tracking-round55";

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

  try {
    const db = getTenantPrisma(schema);
    const trusted = (process.env.CHESS_PUBLIC_FORM_TRUSTED_IP_HEADER ?? "").toLowerCase().trim();
    await claimPublicSurfaceQuota(db, {
      tenant: capability.t, kind: "email_click", resource: params.recipientId,
      clientIp: trustedPublicFormIp(req.headers, trusted),
      rateKey: process.env.CHESS_PUBLIC_FORM_RATE_HASH_KEY ?? "",
    });
    await recordSignedLegacyTracking(db, params.recipientId, "CLICK");
  } catch {
    // A valid signed redirect works even when telemetry is rate-limited.
  }

  return NextResponse.redirect(capability.url, { status: 302, headers: { "Cache-Control": "no-store" } });
}
