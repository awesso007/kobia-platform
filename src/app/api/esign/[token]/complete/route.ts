/**
 * Public signer capability path. Strong random signer token is a bearer
 * credential, but still needs ACTIVE tenant, bounded body, distributed
 * admission, and serializable one-signer-at-a-time mutation with audit.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantPrisma } from "@/lib/db/tenant-prisma";
import { activePublicTenantSchema } from "@/lib/security/public-tenant";
import { signByToken } from "@/lib/documents/envelopes";
import { claimPublicSurfaceQuota } from "@/lib/security/public-surface-round53";
import {
  trustedPublicFormIp, readPublicFormBody, publicFormErrorResponse,
  PublicFormGateError,
} from "@/lib/security/public-form-abuse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
function slug(s: string | null): s is string {
  return !!s && /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(s);
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const tenant = req.nextUrl.searchParams.get("t") ?? req.nextUrl.searchParams.get("tenant");
  if (!slug(tenant) || !/^[A-Za-z0-9_-]{16,128}$/.test(params.token))
    return NextResponse.json({ ok: false, error: "Signing link unavailable." }, { status: 404, headers });
  let signatureData: string;
  try {
    if (!(req.headers.get("content-type") ?? "").startsWith("application/json"))
      throw Error("type");
    const body: unknown = JSON.parse(new TextDecoder().decode(await readPublicFormBody(req, 8192)));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw Error("body");
    const obj = body as Record<string, unknown>;
    if (typeof obj.signatureData !== "string" ||
        !obj.signatureData.trim() || obj.signatureData.length > 120 ||
        Object.keys(obj).some(k => k !== "signatureData"))
      throw Error("signature");
    signatureData = obj.signatureData.trim();
  } catch (error) {
    const f = error instanceof PublicFormGateError
      ? publicFormErrorResponse(error) : { status: 400, message: "Invalid signature." };
    return NextResponse.json({ ok: false, error: f.message }, { status: f.status, headers });
  }
  try {
    const schema = await activePublicTenantSchema(tenant);
    if (!schema) return NextResponse.json({ ok: false, error: "Signing link unavailable." }, { status: 404, headers });
    const db = getTenantPrisma(schema);
    const key = process.env.CHESS_PUBLIC_FORM_RATE_HASH_KEY ?? "";
    const trustedHeader = (process.env.CHESS_PUBLIC_FORM_TRUSTED_IP_HEADER ?? "").trim().toLowerCase();
    const ip = trustedPublicFormIp(req.headers, trustedHeader);
    await claimPublicSurfaceQuota(db, {
      tenant, kind: "esign_sign", resource: params.token,
      clientIp: ip, rateKey: key,
    });
    const result = await signByToken(db, params.token, {
      signatureData,
      ipAddress: ip,
      userAgent: req.headers.get("user-agent")?.slice(0, 256) ?? null,
      tenantSlug: tenant,
    });
    if (!result.ok)
      return NextResponse.json({ ok: false, error: "Signer unavailable." }, { status: 409, headers });
    return NextResponse.json({ ok: true, completed: result.completed ?? false }, { headers });
  } catch (error) {
    const f = publicFormErrorResponse(error);
    return NextResponse.json({ ok: false, error: f.message }, { status: f.status,
      headers: { ...headers, ...(f.retryAfter ? { "Retry-After": f.retryAfter } : {}) } });
  }
}
