/**
 * Round 53 anonymous booking and analytics admission.
 * Shared tenant PostgreSQL counters work across all app replicas. Reuse Round
 * 52 Turnstile, HMAC and explicitly approved edge-IP configuration.
 */
import { createHash } from "node:crypto";
import type { PrismaClient } from "@/lib/db/generated/tenant";
import { getTenantPrisma } from "@/lib/db/tenant-prisma";
import { activePublicTenantSchema } from "./public-tenant";
import {
  publicFormConfig, publicFormDigest, publicFormWindow, trustedPublicFormIp,
  verifyPublicFormChallenge, PublicFormGateError,
} from "./public-form-abuse";

export const publicSurfacePolicies = {
  email_open: { tenant: 10000, resource: 50, visitor: 30, unknown: 5 },
  email_click: { tenant: 10000, resource: 50, visitor: 30, unknown: 5 },
  kb_feedback: { tenant: 600, resource: 60, visitor: 12, unknown: 4 },
  esign_sign: { tenant: 240, resource: 12, visitor: 20, unknown: 5 },
  unsubscribe: { tenant: 10000, resource: 30, visitor: 30, unknown: 5 },
  booking_submit: { tenant: 60, resource: 20, visitor: 5, unknown: 2 },
  booking_manage: { tenant: 90, resource: 30, visitor: 10, unknown: 3 },
  booking_slots: { tenant: 600, resource: 200, visitor: 30, unknown: 5 },
  analytics_form: { tenant: 1000, resource: 180, visitor: 40, unknown: 8 },
  analytics_site: { tenant: 1000, resource: 180, visitor: 40, unknown: 8 },
} as const;
export type PublicSurface = keyof typeof publicSurfacePolicies;
const SCOPE = "CHESS_PUBLIC_SURFACE_R53";

export function publicSurfaceAction(tenant: string, pageSlug: string): string {
  return "booking_" + createHash("sha256")
    .update(JSON.stringify(["booking_submit", tenant, pageSlug]))
    .digest("hex").slice(0, 20);
}

/** All counters advance or roll back together in the tenant PostgreSQL schema. */
export async function claimPublicSurfaceQuota(
  db: PrismaClient,
  input: {
    tenant: string; kind: PublicSurface; resource: string;
    clientIp: string | null; rateKey: string; now?: Date;
  },
): Promise<void> {
  const policy = publicSurfacePolicies[input.kind];
  const namespace = input.kind + ":" + input.resource;
  const windowStart = publicFormWindow(input.now ?? new Date());
  const recipients = [
    { subject: publicFormDigest(input.rateKey, "surface_tenant",
      input.tenant, input.kind), limit: policy.tenant },
    { subject: publicFormDigest(input.rateKey, "surface_resource",
      input.tenant, namespace), limit: policy.resource },
    { subject: publicFormDigest(input.rateKey, "surface_visitor",
      input.tenant, namespace + ":" + (input.clientIp ?? "unknown")),
      limit: input.clientIp ? policy.visitor : policy.unknown },
  ];
  await db.$transaction(async tx => {
    for (const { subject, limit } of recipients) {
      const rows = await tx.$queryRaw<Array<{ hits: number }>>`
        INSERT INTO "ChessRequestRateWindow" ("scope", "subjectDigest", "windowStart", "hits")
        VALUES (${SCOPE}, ${subject}, ${windowStart}, 1)
        ON CONFLICT ("scope", "subjectDigest", "windowStart")
        DO UPDATE SET "hits" = "ChessRequestRateWindow"."hits" + 1
        RETURNING "hits"
      `;
      if (rows.length !== 1 || rows[0]!.hits > limit)
        throw new PublicFormGateError(429, "Request limit reached. Please try again shortly.");
    }
  }, { maxWait: 5000, timeout: 10000 });
}

/**
 * Anonymous admission does not replace authorization: cancellation still needs
 * a booking manage token. Analytics may never dispatch business automations.
 */
export async function admitPublicSurface(
  request: Request,
  input: { tenant: string; kind: PublicSurface; resource: string; token?: unknown },
): Promise<{ db: PrismaClient; ipHash: string | null }> {
  const config = publicFormConfig();
  if (!config) throw new PublicFormGateError(503, "Public service temporarily unavailable.");
  const schema = await activePublicTenantSchema(input.tenant);
  if (!schema) throw new PublicFormGateError(404, "Public resource not available.");
  const db = getTenantPrisma(schema);
  const clientIp = trustedPublicFormIp(request.headers, config.ipHeader);
  await claimPublicSurfaceQuota(db, {
    tenant: input.tenant, kind: input.kind, resource: input.resource,
    clientIp, rateKey: config.rateKey,
  });
  if (input.kind === "booking_submit") {
    const approved = await verifyPublicFormChallenge({
      token: input.token, secret: config.secret,
      action: publicSurfaceAction(input.tenant, input.resource),
      hostnames: config.hostnames,
    });
    if (!approved) throw new PublicFormGateError(403, "Please complete a new security check.");
  }
  return { db, ipHash: clientIp
    ? publicFormDigest(config.rateKey, "surface_analytics_ip", input.tenant, clientIp).slice(0, 32)
    : null };
}
