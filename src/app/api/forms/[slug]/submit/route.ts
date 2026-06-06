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
import { getTenantPrisma, schemaNameForSlug } from "@/lib/db/tenant-prisma";
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

// Best-effort in-memory rate limit: max 10 submits / 60s per IP. Resets on
// cold start; sufficient as a v0.1 abuse speed bump, not a hard guarantee.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_MAX;
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

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ ok: false, error: "Too many submissions. Try again shortly." }, { status: 429, headers: CORS });
  }

  // Accept JSON or form-encoded bodies.
  let payload: Record<string, string> = {};
  try {
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      payload = (await req.json()) as Record<string, string>;
    } else {
      const form = await req.formData();
      for (const [k, v] of form.entries()) payload[k] = typeof v === "string" ? v : "";
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid body." }, { status: 400, headers: CORS });
  }

  // Honeypot: silently accept (200) so bots do not learn they were blocked.
  if (payload._hp && payload._hp.trim() !== "") {
    return NextResponse.json({ ok: true }, { status: 200, headers: CORS });
  }

  const db = getTenantPrisma(schemaNameForSlug(tenantSlug));

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
  await dispatchAutomation({ type: "RECORD_CREATED", entityType: "LEAD", entityId: leadId }, db);

  return NextResponse.json(
    { ok: true, redirectUrl: form.redirectUrl ?? null, thankYouUrl: form.thankYouUrl ?? null },
    { status: 200, headers: CORS },
  );
}
