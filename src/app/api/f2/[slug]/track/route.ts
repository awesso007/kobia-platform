/*
 * Public Forms 2.0 analytics tracker (Sprint 19). Unauthenticated and CORS-open.
 * Records a FormV2Analytics event (VIEW, STEP_ADVANCE, etc.) for the view/submit
 * funnel. Tenant via `?t=<slug>`; IPs hashed. Tracking never surfaces an error
 * to the public page.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "crypto";
import { getTenantPrisma, schemaNameForSlug } from "@/lib/db/tenant-prisma";
import { trackFormEvent } from "@/lib/forms2/mutations";

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
  if (!tenantSlug) return NextResponse.json({ ok: true }, { status: 200, headers: CORS });

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: true }, { status: 200, headers: CORS });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const ipHash = ip !== "unknown" ? createHash("sha256").update(ip).digest("hex").slice(0, 32) : null;

  try {
    const db = getTenantPrisma(schemaNameForSlug(tenantSlug));
    await trackFormEvent(db, params.slug, String(body.event ?? ""), {
      stepId: body.stepId ? String(body.stepId) : null,
      path: body.path ? String(body.path).slice(0, 512) : null,
      referrer: req.headers.get("referer"),
      ipHash,
    });
  } catch {
    // best-effort
  }
  return NextResponse.json({ ok: true }, { status: 200, headers: CORS });
}
