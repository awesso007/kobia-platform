/**
 * Public Forms 2.0 untrusted telemetry. Track only real PUBLISHED forms,
 * valid form-owned steps and non-authoritative navigation events. No browser
 * analytics payload can forge SUBMIT_SUCCESS / PAYMENT_SUCCESS or a workflow.
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
const events = ["VIEW", "STEP_ADVANCE", "STEP_BACK", "SUBMIT_ATTEMPT"] as const;
type Event = typeof events[number];
function safeString(value: unknown, max = 512): string | null {
  return typeof value === "string" && value.length <= max ? value : null;
}
function slug(s: string | null): s is string {
  return !!s && /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(s);
}
export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const tenant = req.nextUrl.searchParams.get("t");
  if (!slug(tenant) || !slug(params.slug))
    return NextResponse.json({ ok: false, error: "Invalid target." }, { status: 400, headers: CORS });
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
  // Successful submissions and payments are server-authoritative, not browser
  // telemetry. Invalid event types produce no write or side effects.
  if (!events.includes(body.event as Event))
    return NextResponse.json({ ok: true }, { status: 200, headers: CORS });
  const stepId = body.stepId === null || body.stepId === undefined
    ? null : safeString(body.stepId, 128);
  if (body.stepId !== null && body.stepId !== undefined && !stepId)
    return NextResponse.json({ ok: true }, { status: 200, headers: CORS });
  let admitted: Awaited<ReturnType<typeof admitPublicSurface>>;
  try {
    admitted = await admitPublicSurface(req, {
      tenant, kind: "analytics_form", resource: params.slug,
    });
  } catch (error) {
    const f = publicFormErrorResponse(error);
    return NextResponse.json({ ok: false, error: f.message }, { status: f.status,
      headers: { ...CORS, ...(f.retryAfter ? { "Retry-After": f.retryAfter } : {}) } });
  }
  try {
    const db = admitted.db;
    const form = await db.formV2.findUnique({
      where: { slug: params.slug }, select: { id: true, status: true },
    });
    if (!form || form.status !== "PUBLISHED")
      return NextResponse.json({ ok: true }, { status: 200, headers: CORS });
    if (stepId) {
      const belongs = await db.formStep.findFirst({
        where: { id: stepId, formId: form.id }, select: { id: true },
      });
      if (!belongs) return NextResponse.json({ ok: true }, { status: 200, headers: CORS });
    }
    const event = body.event as Event;
    await db.formV2Analytics.create({
      data: {
        formId: form.id, stepId, event,
        path: safeString(body.path),
        referrer: safeString(req.headers.get("referer"), 512),
        ipHash: admitted.ipHash,
      },
    });
  } catch {
    // Untrusted telemetry is best-effort; no exception leaks PII or schema.
  }
  return NextResponse.json({ ok: true }, { status: 200, headers: CORS });
}
