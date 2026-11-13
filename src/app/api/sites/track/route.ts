/**
 * Public site analytics is untrusted observational telemetry, not a business
 * event. It MUST NOT dispatch SITE_FORM_SUBMIT automations on anonymous claims.
 * Published site and page ownership are checked before insert.
 */
import { NextResponse, type NextRequest } from "next/server";
import { admitPublicSurface } from "@/lib/security/public-surface-round53";
import { readPublicFormBody, publicFormErrorResponse, PublicFormGateError } from "@/lib/security/public-form-abuse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};
const eventTypes = ["PAGEVIEW", "CLICK", "FORM_SUBMIT"] as const;
type EventType = typeof eventTypes[number];
function boundedString(value: unknown, max: number): string | null {
  return typeof value === "string" && value.length <= max ? value : null;
}
function validTenant(s: string | null): s is string {
  return !!s && /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(s);
}
export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
export async function POST(req: NextRequest) {
  const tenant = req.nextUrl.searchParams.get("t");
  if (!validTenant(tenant))
    return NextResponse.json({ ok: false, error: "Invalid tenant." }, { status: 400, headers: CORS });
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(await readPublicFormBody(req, 8192)));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw Error("body");
    body = parsed as Record<string, unknown>;
  } catch (error) {
    const f = error instanceof PublicFormGateError
      ? publicFormErrorResponse(error) : { status: 400, message: "Invalid body." };
    return NextResponse.json({ ok: false, error: f.message }, { status: f.status, headers: CORS });
  }
  const siteId = boundedString(body.siteId, 128);
  const pageId = body.pageId === null || body.pageId === undefined
    ? null : boundedString(body.pageId, 128);
  if (!siteId || !/^[a-zA-Z0-9_-]+$/.test(siteId) ||
      (body.pageId !== null && body.pageId !== undefined && !pageId) ||
      !eventTypes.includes(body.eventType as EventType)) {
    return NextResponse.json({ ok: false, error: "Invalid analytics event." },
      { status: 400, headers: CORS });
  }

  let admitted: Awaited<ReturnType<typeof admitPublicSurface>>;
  try {
    admitted = await admitPublicSurface(req, {
      tenant, kind: "analytics_site", resource: siteId,
    });
  } catch (error) {
    const f = publicFormErrorResponse(error);
    return NextResponse.json({ ok: false, error: f.message }, { status: f.status,
      headers: { ...CORS, ...(f.retryAfter ? { "Retry-After": f.retryAfter } : {}) } });
  }
  try {
    const db = admitted.db;
    const site = await db.site.findUnique({
      where: { id: siteId }, select: { id: true, published: true },
    });
    if (!site?.published)
      return NextResponse.json({ ok: false, error: "Site not found." }, { status: 404, headers: CORS });
    if (pageId) {
      const page = await db.sitePage.findFirst({
        where: { id: pageId, siteId, published: true }, select: { id: true },
      });
      if (!page)
        return NextResponse.json({ ok: false, error: "Page not found." }, { status: 404, headers: CORS });
    }
    const eventType = body.eventType as EventType;
    await db.siteAnalytics.create({
      data: {
        siteId, pageId, eventType, path: boundedString(body.path, 512),
        referrer: boundedString(body.referrer, 512) ?? boundedString(req.headers.get("referer"), 512),
        userAgent: boundedString(req.headers.get("user-agent"), 512),
        ipHash: admitted.ipHash,
      },
    });
    // No dispatchAutomation here: anonymous tracking is NOT an authoritative
    // form submission. The authenticated form handler owns that transition.
    return NextResponse.json({ ok: true }, { status: 200, headers: CORS });
  } catch {
    return NextResponse.json({ ok: true }, { status: 200, headers: CORS });
  }
}
