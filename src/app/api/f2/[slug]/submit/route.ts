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
import { createHash } from "crypto";
import { getTenantPrisma, schemaNameForSlug } from "@/lib/db/tenant-prisma";
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

// Best-effort in-memory rate limit: max 20 submits / 60s per IP.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20;
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

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const tenantSlug = sanitizeSlug(req.nextUrl.searchParams.get("t"));
  if (!tenantSlug) {
    return NextResponse.json({ ok: false, error: "Missing or invalid tenant." }, { status: 400, headers: CORS });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ ok: false, error: "Too many submissions. Try again shortly." }, { status: 429, headers: CORS });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid body." }, { status: 400, headers: CORS });
  }
  const values = (body.values && typeof body.values === "object" ? body.values : {}) as Record<string, unknown>;
  const ipHash = ip !== "unknown" ? createHash("sha256").update(ip).digest("hex").slice(0, 32) : null;

  try {
    const db = getTenantPrisma(schemaNameForSlug(tenantSlug));
    const result = await submitForm(db, params.slug, values, {
      userAgent: req.headers.get("user-agent"),
      referrer: req.headers.get("referer"),
      ipHash,
    });
    if (!result) return NextResponse.json({ ok: false, error: "Form not available." }, { status: 404, headers: CORS });
    if (!result.ok) return NextResponse.json({ ok: false, errors: result.errors }, { status: 422, headers: CORS });
    return NextResponse.json(result, { status: 201, headers: CORS });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500, headers: CORS });
  }
}
