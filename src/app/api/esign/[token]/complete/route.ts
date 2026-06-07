/*
 * Public e-signature complete endpoint (Sprint 14). POST records a signature for
 * the signer identified by [token], advancing the signer to SIGNED, emailing the
 * next signer in order, and rolling the envelope up to COMPLETED once all signers
 * have signed (handled in signByToken). Logs SIGNED/COMPLETED audit events with
 * the request IP and user agent. Unauthenticated by design - the signer token is
 * the credential. Tenant is resolved from a validated `?t=<slug>` query param
 * (middleware does not attach a tenant header for /api/esign).
 *
 * We use /api/esign rather than /api/sign because /sign is already taken by the
 * accounting product's engagement-letter signing route.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getTenantPrisma, schemaNameForSlug } from "@/lib/db/tenant-prisma";
import { signByToken } from "@/lib/documents/envelopes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(slug) ? slug : null;
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const url = new URL(req.url);
  const tenant = sanitizeSlug(url.searchParams.get("t")) ?? sanitizeSlug(url.searchParams.get("tenant"));
  if (!tenant) return NextResponse.json({ ok: false, error: "Missing tenant." }, { status: 400 });

  let body: { signatureData?: string; fields?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }

  const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = req.headers.get("user-agent") ?? null;

  try {
    const db = getTenantPrisma(schemaNameForSlug(tenant));
    const res = await signByToken(db, params.token, {
      signatureData: body.signatureData ?? null,
      fields: body.fields,
      ipAddress,
      userAgent,
    });
    if (!res.ok) return NextResponse.json({ ok: false, error: res.detail }, { status: 400 });
    return NextResponse.json({ ok: true, completed: res.completed ?? false });
  } catch {
    return NextResponse.json({ ok: false, error: "Could not record signature." }, { status: 500 });
  }
}
