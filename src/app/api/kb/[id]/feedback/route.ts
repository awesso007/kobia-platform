/**
 * Public KB feedback is observational, not a permission to mutate private
 * articles. Require active tenant, published/public article, strict bounded
 * inputs, distributed quotas, and atomic feedback/counter updates.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantPrisma } from "@/lib/db/tenant-prisma";
import { activePublicTenantSchema } from "@/lib/security/public-tenant";
import { recordFeedback } from "@/lib/helpdesk/kb";
import { claimPublicSurfaceQuota } from "@/lib/security/public-surface-round53";
import {
  readPublicFormBody, publicFormErrorResponse, PublicFormGateError, trustedPublicFormIp,
} from "@/lib/security/public-form-abuse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
function tenantSlug(s: string | null): s is string {
  return !!s && /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(s);
}
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const tenant = req.nextUrl.searchParams.get("t") ?? req.nextUrl.searchParams.get("tenant");
  if (!tenantSlug(tenant) || !/^[A-Za-z0-9_-]{8,128}$/.test(params.id))
    return NextResponse.json({ ok: false, error: "Article not found." }, { status: 404, headers });
  let input: { helpful: boolean; comment: string | null };
  try {
    if (!(req.headers.get("content-type") ?? "").startsWith("application/json"))
      throw Error("content type");
    const body: unknown = JSON.parse(new TextDecoder().decode(await readPublicFormBody(req, 8192)));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw Error("body");
    const obj = body as Record<string, unknown>;
    if (typeof obj.helpful !== "boolean" ||
        (obj.comment !== undefined && typeof obj.comment !== "string") ||
        (typeof obj.comment === "string" && obj.comment.length > 500))
      throw Error("payload");
    input = { helpful: obj.helpful, comment: typeof obj.comment === "string" ? obj.comment.trim() || null : null };
  } catch (error) {
    const f = error instanceof PublicFormGateError
      ? publicFormErrorResponse(error) : { status: 400, message: "Invalid feedback." };
    return NextResponse.json({ ok: false, error: f.message }, { status: f.status, headers });
  }
  try {
    const schema = await activePublicTenantSchema(tenant);
    if (!schema) return NextResponse.json({ ok: false, error: "Article not found." }, { status: 404, headers });
    const db = getTenantPrisma(schema);
    const trusted = (process.env.CHESS_PUBLIC_FORM_TRUSTED_IP_HEADER ?? "").trim().toLowerCase();
    await claimPublicSurfaceQuota(db, {
      tenant, kind: "kb_feedback", resource: params.id,
      clientIp: trustedPublicFormIp(req.headers, trusted),
      rateKey: process.env.CHESS_PUBLIC_FORM_RATE_HASH_KEY ?? "",
    });
    const ok = await recordFeedback(db, params.id, input.helpful, input.comment);
    if (!ok) return NextResponse.json({ ok: false, error: "Article not found." }, { status: 404, headers });
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    const f = publicFormErrorResponse(error);
    return NextResponse.json({ ok: false, error: f.message }, { status: f.status,
      headers: { ...headers, ...(f.retryAfter ? { "Retry-After": f.retryAfter } : {}) } });
  }
}
