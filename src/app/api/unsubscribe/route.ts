/**
 * Round 54: unsubscribe requires possession of a cryptographically authenticated
 * recipient capability. Email, tenant and reason supplied by a stranger are
 * NEVER authorization to suppress a third party's marketing delivery.
 *
 * This endpoint remains usable independently of interactive bot checks: an
 * unsubscribe must not require a challenge or knowledge of the email address.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantPrisma } from "@/lib/db/tenant-prisma";
import { activePublicTenantSchema } from "@/lib/security/public-tenant";
import {
  openUnsubscribeIdentity, unsubscribeKeys,
} from "@/lib/security/public-unsubscribe-round54";
import {
  PublicFormGateError, readPublicFormBody, publicFormErrorResponse,
  trustedPublicFormIp, publicFormDigest,
} from "@/lib/security/public-form-abuse";
import { claimPublicSurfaceQuota } from "@/lib/security/public-surface-round53";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    if (!(req.headers.get("content-type") ?? "").startsWith("application/json"))
      throw new PublicFormGateError(403, "Invalid unsubscribe request.");
    const parsed: unknown = JSON.parse(new TextDecoder().decode(await readPublicFormBody(req, 8192)));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw Error("body");
    body = parsed as Record<string, unknown>;
  } catch (error) {
    const failure = error instanceof PublicFormGateError
      ? publicFormErrorResponse(error) : { status: 400, message: "Invalid unsubscribe request." };
    return NextResponse.json({ ok: false, error: failure.message }, { status: failure.status, headers });
  }
  const keys = unsubscribeKeys();
  if (!keys.length) {
    return NextResponse.json({ ok: false, error: "Unsubscribe temporarily unavailable." },
      { status: 503, headers });
  }
  const identity = openUnsubscribeIdentity(
    typeof body.cap === "string" ? body.cap : null, keys);
  if (!identity) {
    return NextResponse.json({ ok: false, error: "Unsubscribe link unavailable." },
      { status: 404, headers });
  }
  if (body.reason !== undefined && (typeof body.reason !== "string" || body.reason.length > 500))
    return NextResponse.json({ ok: false, error: "Invalid reason." }, { status: 400, headers });
  const reason = (body.reason as string | undefined)?.trim() || null;
  try {
    const schema = await activePublicTenantSchema(identity.tenant);
    if (!schema) return NextResponse.json({ ok: false, error: "Unsubscribe link unavailable." }, { status: 404, headers });
    const db = getTenantPrisma(schema);
    const key = keys[0]!.toString("hex");
    const ipHeader = (process.env.CHESS_PUBLIC_FORM_TRUSTED_IP_HEADER ?? "").toLowerCase().trim();
    const clientIp = trustedPublicFormIp(req.headers, ipHeader);
    await claimPublicSurfaceQuota(db, {
      tenant: identity.tenant, kind: "unsubscribe",
      resource: publicFormDigest(key, "unsub_resource", identity.tenant, identity.email),
      clientIp, rateKey: key,
    });
    // Never split the suppression record from pending recipient updates.
    await db.$transaction(async tx => {
      await tx.unsubscribe.upsert({
        where: { email: identity.email },
        update: { reason, source: "PORTAL" },
        create: { email: identity.email, reason, source: "PORTAL" },
      });
      await tx.broadcastRecipient.updateMany({
        where: { email: { equals: identity.email, mode: "insensitive" }, status: "PENDING" },
        data: { status: "UNSUBSCRIBED" },
      });
    });
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    const failure = publicFormErrorResponse(error);
    return NextResponse.json({ ok: false, error: failure.message }, {
      status: failure.status, headers: {
        ...headers, ...(failure.retryAfter ? { "Retry-After": failure.retryAfter } : {}),
      },
    });
  }
}
