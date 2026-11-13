/**
 * Machine-only Vercel cron authentication for legacy KOBIA scheduled routes.
 * Vercel adds Authorization: Bearer <CRON_SECRET> to configured cron requests.
 * Reject absent/weak configuration, unsupported auth schemes and bearer
 * mismatches before touching a tenant registry or starting a worker.
 * This does not audit or authorize other webhook/callback families.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

const MIN_SECRET_BYTES = 32;

export type CronDecision = "AUTHORIZED" | "UNCONFIGURED" | "UNAUTHORIZED";

export function cronAuthorizationDecision(
  request: Pick<Request, "headers">,
  secret: string | undefined,
): CronDecision {
  if (!secret || Buffer.byteLength(secret, "utf8") < MIN_SECRET_BYTES) {
    return "UNCONFIGURED";
  }
  const value = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  // Fixed-length digest comparison avoids a secret-dependent prefix compare.
  const actualHash = createHash("sha256").update(value, "utf8").digest();
  const expectedHash = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(actualHash, expectedHash) ? "AUTHORIZED" : "UNAUTHORIZED";
}

export function requireKobiaCronAuth(
  request: Request,
  secret: string | undefined = process.env.CRON_SECRET,
): Response | null {
  const decision = cronAuthorizationDecision(request, secret);
  if (decision === "AUTHORIZED") return null;
  return NextResponse.json(
    { error: decision === "UNCONFIGURED" ? "Scheduler unavailable" : "Unauthorized" },
    {
      status: decision === "UNCONFIGURED" ? 503 : 401,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
