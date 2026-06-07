/*
 * Public site analytics tracking endpoint (Sprint 17). Unauthenticated and
 * CORS-open so the published site (and the TrackBeacon island) can post events.
 * Records a SiteAnalytics row (PAGEVIEW / CLICK / FORM_SUBMIT). A FORM_SUBMIT
 * also dispatches the SITE_FORM_SUBMIT automation.
 *
 * Tenant is resolved from a validated `?t=<slug>` query param (the middleware
 * does not attach a tenant header for /api/sites). IPs are hashed, never stored
 * raw. A small per-IP rate limit caps bursts.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "crypto";
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

const EVENT_TYPES = ["PAGEVIEW", "CLICK", "FORM_SUBMIT"] as const;
type EventType = (typeof EVENT_TYPES)[number];

// Best-effort in-memory rate limit: max 60 events / 60s per IP. Resets on cold
// start; a v0.1 abuse speed bump, not a hard guarantee.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 60;
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

export async function POST(req: NextRequest) {
  const tenantSlug = sanitizeSlug(req.nextUrl.searchParams.get("t"));
  if (!tenantSlug) {
    return NextResponse.json({ ok: false, error: "Missing or invalid tenant." }, { status: 400, headers: CORS });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ ok: true }, { status: 200, headers: CORS });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid body." }, { status: 400, headers: CORS });
  }

  const siteId = String(body.siteId ?? "");
  if (!siteId) return NextResponse.json({ ok: false, error: "siteId is required." }, { status: 400, headers: CORS });
  const pageId = body.pageId ? String(body.pageId) : null;
  const eventType = (EVENT_TYPES.includes(body.eventType as EventType) ? body.eventType : "PAGEVIEW") as EventType;
  const path = body.path ? String(body.path).slice(0, 512) : null;
  const referrer = body.referrer ? String(body.referrer).slice(0, 512) : req.headers.get("referer");
  const userAgent = req.headers.get("user-agent");
  const ipHash = ip !== "unknown" ? createHash("sha256").update(ip).digest("hex").slice(0, 32) : null;

  try {
    const db = getTenantPrisma(schemaNameForSlug(tenantSlug));
    const site = await db.site.findUnique({ where: { id: siteId }, select: { id: true } });
    if (!site) return NextResponse.json({ ok: false, error: "Unknown site." }, { status: 404, headers: CORS });

    await db.siteAnalytics.create({
      data: { siteId, pageId, eventType, path, referrer: referrer || null, userAgent: userAgent || null, ipHash },
    });

    if (eventType === "FORM_SUBMIT") {
      await dispatchAutomation(
        { type: "SITE_FORM_SUBMIT", entityType: "SITE_PAGE", entityId: pageId ?? siteId, payload: { siteId, pageId, path } },
        db,
      ).catch(() => undefined);
    }

    return NextResponse.json({ ok: true }, { status: 200, headers: CORS });
  } catch {
    // Tracking must never surface an error to the public page.
    return NextResponse.json({ ok: true }, { status: 200, headers: CORS });
  }
}
