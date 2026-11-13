/*
 * Public web-to-lead submit endpoint (Sprint 5). POST creates a Lead in the
 * target tenant from a hosted or embedded form, then runs RECORD_CREATED
 * automations. Unauthenticated and CORS-open (Access-Control-Allow-Origin: *)
 * so it can be called from any embedding site.
 *
 * Tenant is resolved from a validated `?t=<slug>` query param (the middleware
 * does not attach a tenant header for /api/forms). The form is then looked up
 * by [slug] within that tenant schema.
 *
 * Spam protection: a honeypot field ("_hp" - real users never fill it) is
 * rejected silently with 200, and a small in-memory per-IP rate limit caps
 * bursts. Both are best-effort for v0.1.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { admitPublicFormSubmission, readPublicFormBody,
  publicFormErrorResponse, PublicFormGateError } from "@/lib/security/public-form-abuse";
import { dispatchAutomation } from "@/lib/automations/dispatch";

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

type FieldConfig = { fieldName: string; label?: string; type?: string; required?: boolean };

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const tenantSlug = sanitizeSlug(req.nextUrl.searchParams.get("t"));
  if (!tenantSlug) {
    return NextResponse.json({ ok: false, error: "Missing or invalid tenant." }, { status: 400, headers: CORS });
  }

  // Bound bytes before parsing; CORS-open embeds must still prove a bot check.
  // Only JSON and browser-encoded form payloads are supported.
  let payload: Record<string, string> = {};
  try {
    const raw = await readPublicFormBody(req);
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const obj: unknown = JSON.parse(new TextDecoder().decode(raw));
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw Error("body");
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value !== "string") throw Error("field type");
        payload[key] = value;
      }
    } else if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
      const parsed = new Request(req.url, { method: "POST",
        headers: { "Content-Type": ct },
        body: new Blob([raw.buffer as ArrayBuffer]),
      });
      const form = await parsed.formData();
      for (const [key, value] of form.entries()) {
        if (typeof value !== "string") throw Error("file upload not supported");
        payload[key] = value;
      }
    } else throw Error("content-type");
  } catch (error) {
    const failure = error instanceof PublicFormGateError
      ? publicFormErrorResponse(error) : { status: 400, message: "Invalid body." };
    return NextResponse.json({ ok: false, error: failure.message },
      { status: failure.status, headers: CORS });
  }

  // Honeypot: silently accept (200) so bots do not learn they were blocked.
  if (payload._hp && payload._hp.trim() !== "") {
    return NextResponse.json({ ok: true }, { status: 200, headers: CORS });
  }

  // Token is never copied into lead notes, indexing, or automations.
  const token = payload["cf-turnstile-response"];
  delete payload["cf-turnstile-response"];
  let db: Awaited<ReturnType<typeof admitPublicFormSubmission>>["db"];
  try {
    ({ db } = await admitPublicFormSubmission(req, {
      tenant: tenantSlug, kind: "legacy", form: params.slug, token,
    }));
  } catch (error) {
    const failure = publicFormErrorResponse(error);
    return NextResponse.json({ ok: false, error: failure.message },
      { status: failure.status, headers: {
        ...CORS, "Cache-Control": "no-store",
        ...(failure.retryAfter ? { "Retry-After": failure.retryAfter } : {}),
      } });
  }

  const form = await db.webForm.findUnique({ where: { slug: params.slug } });
  if (!form) {
    return NextResponse.json({ ok: false, error: "Form not found." }, { status: 404, headers: CORS });
  }

  const fields = (form.fieldsConfig as FieldConfig[] | null) ?? [];
  for (const f of fields) {
    if (f.required && !String(payload[f.fieldName] ?? "").trim()) {
      return NextResponse.json({ ok: false, error: `${f.label ?? f.fieldName} is required.` }, { status: 400, headers: CORS });
    }
  }

  const name =
    (payload.name ?? payload.fullName ?? `${payload.firstName ?? ""} ${payload.lastName ?? ""}`).trim() ||
    payload.email?.trim() ||
    "Website lead";

  const notesParts = fields
    .filter((f) => !["name", "email", "phone", "companyName", "company"].includes(f.fieldName))
    .map((f) => `${f.label ?? f.fieldName}: ${payload[f.fieldName] ?? ""}`)
    .filter((line) => line.split(": ")[1]?.trim());

  let leadId: string;
  try {
    const lead = await db.lead.create({
      data: {
        name,
        email: payload.email?.trim() || null,
        phone: payload.phone?.trim() || null,
        companyName: (payload.companyName ?? payload.company)?.trim() || null,
        source: "WEBSITE",
        status: "NEW",
        notes: notesParts.length ? notesParts.join("\n") : null,
      },
    });
    leadId = lead.id;
  } catch (err) {
    console.error("[forms/submit] lead create failed", err);
    return NextResponse.json({ ok: false, error: "Could not save submission." }, { status: 500, headers: CORS });
  }

  // Run RECORD_CREATED automations against the new lead (tenant-bound db).
  await dispatchAutomation({ type: "RECORD_CREATED", entityType: "LEAD", entityId: leadId }, db).catch(() => undefined);

  return NextResponse.json(
    { ok: true, redirectUrl: form.redirectUrl ?? null, thankYouUrl: form.thankYouUrl ?? null },
    { status: 200, headers: CORS },
  );
}
