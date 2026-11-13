/*
 * Public Forms 2.0 submission endpoint (Sprint 19). Unauthenticated and
 * CORS-open so a hosted/embedded form can post. Tenant resolves from a validated
 * `?t=<slug>` query param (middleware attaches no tenant header for /api/f2).
 * Server-side validation runs regardless of what the browser did; IPs are
 * hashed, never stored raw. A submitForm success dispatches FORM_V2_SUBMIT
 * (unless payment is still due).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { admitPublicFormSubmission, readPublicFormBody,
  publicFormErrorResponse, PublicFormGateError } from "@/lib/security/public-form-abuse";
import { submitForm } from "@/lib/forms2/mutations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function sanitizeSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(slug) ? slug : null;
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const tenantSlug = sanitizeSlug(req.nextUrl.searchParams.get("t"));
  if (!tenantSlug) {
    return NextResponse.json({ ok: false, error: "Missing or invalid tenant." }, { status: 400, headers: CORS });
  }
  let body: Record<string, unknown>;
  try {
    const raw = await readPublicFormBody(req);
    const value: unknown = JSON.parse(new TextDecoder().decode(raw));
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw Error("Invalid JSON root");
    body = value as Record<string, unknown>;
  } catch (error) {
    const failure = error instanceof PublicFormGateError
      ? publicFormErrorResponse(error) : { status: 400, message: "Invalid body." };
    return NextResponse.json({ ok: false, error: failure.message },
      { status: failure.status, headers: CORS });
  }
  const values = (body.values && typeof body.values === "object" &&
    !Array.isArray(body.values) ? body.values : {}) as Record<string, unknown>;
  // Prevent caller-injected challenge fields from being persisted in
  // the FormV2Submission JSON document by the legacy submit helper.
  delete values.turnstileToken;
  delete values["cf-turnstile-response"];
  let admitted: Awaited<ReturnType<typeof admitPublicFormSubmission>>;
  try {
    admitted = await admitPublicFormSubmission(req, {
      tenant: tenantSlug, kind: "v2", form: params.slug, token: body.turnstileToken,
    });
  } catch (error) {
    const failure = publicFormErrorResponse(error);
    return NextResponse.json({ ok: false, error: failure.message },
      { status: failure.status, headers: {
        ...CORS, "Cache-Control": "no-store",
        ...(failure.retryAfter ? { "Retry-After": failure.retryAfter } : {}),
      } });
  }

  try {
    const result = await submitForm(admitted.db, params.slug, values, {
      userAgent: req.headers.get("user-agent"),
      referrer: req.headers.get("referer"),
      ipHash: admitted.ipHash,
    });
    if (!result) return NextResponse.json({ ok: false, error: "Form not available." }, { status: 404, headers: CORS });
    if (!result.ok) return NextResponse.json({ ok: false, errors: result.errors }, { status: 422, headers: CORS });
    return NextResponse.json(result, { status: 201, headers: CORS });
  } catch {
    return NextResponse.json({ ok: false, error: "Form temporarily unavailable." }, { status: 503, headers: CORS });
  }
}
