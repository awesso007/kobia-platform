/**
 * Round 52: cross-instance, fail-closed public form admission. No process maps.
 * The preexisting tenant ChessRequestRateWindow table holds atomic quotas.
 */
import { createHmac, createHash } from "node:crypto";
import { isIP } from "node:net";
import type { PrismaClient } from "@/lib/db/generated/tenant";
import { getTenantPrisma } from "@/lib/db/tenant-prisma";
import { activePublicTenantSchema } from "./public-tenant";

export type PublicFormKind = "legacy" | "v2";
export const PUBLIC_FORM_QUOTAS = { tenant: 120, form: 40, visitor: 8, unknown: 3 } as const;
const ipHeaders = new Set(["x-vercel-forwarded-for", "cf-connecting-ip"]);
const scope = "PUBLIC_FORM_SUBMIT_V1";

export class PublicFormGateError extends Error {
  constructor(readonly status: 403 | 404 | 429 | 503, readonly safeMessage: string) {
    super(safeMessage);
    this.name = "PublicFormGateError";
  }
}
export function publicFormErrorResponse(error: unknown): {
  status: number; message: string; retryAfter?: string;
} {
  if (error instanceof PublicFormGateError)
    return { status: error.status, message: error.safeMessage,
      ...(error.status === 429 ? { retryAfter: "60" } : {}) };
  return { status: 503, message: "Form temporarily unavailable." };
}
export function publicFormConfig(env: NodeJS.ProcessEnv = process.env) {
  if (env.CHESS_PUBLIC_FORM_ABUSE_ENABLED !== "true") return null;
  const rateKey = env.CHESS_PUBLIC_FORM_RATE_HASH_KEY ?? "";
  const secret = env.CHESS_TURNSTILE_SECRET_KEY ?? "";
  const siteKey = env.NEXT_PUBLIC_CHESS_TURNSTILE_SITE_KEY ?? "";
  const ipHeader = (env.CHESS_PUBLIC_FORM_TRUSTED_IP_HEADER ?? "").toLowerCase().trim();
  const hostnames = (env.CHESS_TURNSTILE_ALLOWED_HOSTNAMES ?? "").split(",")
    .map(h => h.trim().toLowerCase()).filter(Boolean);
  if (rateKey.length < 32 || secret.length < 16 || siteKey.length < 8 ||
      !ipHeaders.has(ipHeader) || hostnames.length === 0 ||
      hostnames.some(h => h.includes("*") || h.includes("/") || h.includes(":") ||
        !/^[a-z0-9.-]+$/.test(h)) ||
      new Set(hostnames).size !== hostnames.length) return null;
  return { rateKey, secret, siteKey, ipHeader, hostnames };
}
export function publicFormAction(kind: PublicFormKind, tenant: string, form: string): string {
  return "form_" + createHash("sha256").update(JSON.stringify([kind, tenant, form]))
    .digest("hex").slice(0, 20);
}
export function trustedPublicFormIp(headers: Headers, configuredHeader: string): string | null {
  if (!ipHeaders.has(configuredHeader)) return null;
  const value = headers.get(configuredHeader)?.trim() ?? "";
  // Ingress MUST overwrite this header. Never trust arbitrary XFF chains.
  return isIP(value) ? value.toLowerCase() : null;
}
export function publicFormDigest(key: string, type: string, tenant: string, identity: string): string {
  if (key.length < 32) throw Error("Rate HMAC key unavailable");
  return createHmac("sha256", key).update(JSON.stringify([
    "PUBLIC_FORM_RATE_V1", type, tenant, identity,
  ])).digest("hex");
}
export function publicFormWindow(now: Date): Date {
  return new Date(Math.floor(now.getTime() / 60000) * 60000);
}
/** Every subject increment must commit together; rollback on any exceeded quota. */
export async function claimPublicFormQuota(db: PrismaClient, input: {
  tenant: string; kind: PublicFormKind; form: string;
  clientIp: string | null; rateKey: string; now?: Date;
}): Promise<void> {
  const form = input.kind + ":" + input.form;
  const recipients = [
    { id: publicFormDigest(input.rateKey, "tenant", input.tenant, input.tenant),
      max: PUBLIC_FORM_QUOTAS.tenant },
    { id: publicFormDigest(input.rateKey, "form", input.tenant, form),
      max: PUBLIC_FORM_QUOTAS.form },
    { id: publicFormDigest(input.rateKey, "visitor", input.tenant,
        form + ":" + (input.clientIp ?? "unknown")),
      max: input.clientIp ? PUBLIC_FORM_QUOTAS.visitor : PUBLIC_FORM_QUOTAS.unknown },
  ];
  const windowStart = publicFormWindow(input.now ?? new Date());
  await db.$transaction(async tx => {
    for (const item of recipients) {
      const rows = await tx.$queryRaw<Array<{ hits: number }>>`
        INSERT INTO "ChessRequestRateWindow" ("scope","subjectDigest","windowStart","hits")
        VALUES (${scope},${item.id},${windowStart},1)
        ON CONFLICT ("scope","subjectDigest","windowStart")
        DO UPDATE SET "hits" = "ChessRequestRateWindow"."hits" + 1
        RETURNING "hits"
      `;
      if (rows.length !== 1 || rows[0]!.hits > item.max)
        throw new PublicFormGateError(429, "Too many submissions. Please try again shortly.");
    }
  }, { maxWait: 5000, timeout: 10000 });
}
export async function verifyPublicFormChallenge(input: {
  token: unknown; secret: string; action: string; hostnames: string[];
}, doFetch: typeof fetch = fetch): Promise<boolean> {
  if (typeof input.token !== "string" || input.token.length < 1 || input.token.length > 2048)
    return false;
  try {
    const response = await doFetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: input.secret, response: input.token }),
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!response.ok) return false;
    const result = await response.json() as {
      success?: boolean; hostname?: string; action?: string;
    };
    return result.success === true && result.action === input.action &&
      typeof result.hostname === "string" &&
      input.hostnames.includes(result.hostname.toLowerCase());
  } catch { return false; }
}
export async function admitPublicFormSubmission(request: Request, input: {
  tenant: string; kind: PublicFormKind; form: string; token: unknown;
}): Promise<{ db: PrismaClient; ipHash: string | null }> {
  const config = publicFormConfig();
  if (!config) throw new PublicFormGateError(503, "Form protection unavailable.");
  const schema = await activePublicTenantSchema(input.tenant);
  if (!schema) throw new PublicFormGateError(404, "Form not available.");
  const clientIp = trustedPublicFormIp(request.headers, config.ipHeader);
  const db = getTenantPrisma(schema);
  await claimPublicFormQuota(db, { tenant: input.tenant, kind: input.kind,
    form: input.form, clientIp, rateKey: config.rateKey });
  const approved = await verifyPublicFormChallenge({
    token: input.token, secret: config.secret,
    action: publicFormAction(input.kind, input.tenant, input.form),
    hostnames: config.hostnames,
  });
  if (!approved) throw new PublicFormGateError(403, "Please complete a new security check.");
  return { db, ipHash: clientIp
    ? publicFormDigest(config.rateKey, "analytics-ip", input.tenant, clientIp).slice(0, 32)
    : null };
}
/** Read a small bounded body, rather than parsing unbounded JSON. */
export async function readPublicFormBody(request: Request, maxBytes = 32768): Promise<Uint8Array> {
  const size = request.headers.get("content-length");
  if (size && (!/^[0-9]+$/.test(size) || Number(size) > maxBytes))
    throw new PublicFormGateError(403, "Invalid submission.");
  const reader = request.body?.getReader();
  if (!reader) throw new PublicFormGateError(403, "Invalid submission.");
  let total = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new PublicFormGateError(403, "Submission too large.");
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
