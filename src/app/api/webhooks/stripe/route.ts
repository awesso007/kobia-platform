/**
 * Legacy accounting signup Stripe callback quarantine (Round 48).
 *
 * This historical handler provisioned tenants and changed subscriptions
 * without a durable unique Stripe event receipt or a witnessed replay/order
 * acceptance run. Signature checking alone does not establish idempotent,
 * reversible, tenant-bound provisioning and financial outcomes.
 *
 * Preserve the source history in git; do not invoke legacy provisioning here.
 * A replacement requires a separately reviewed, versioned event inbox and
 * protected provider tests. No environment value can turn this handler on.
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  return NextResponse.json(
    { ok: false, error: "Legacy signup billing webhook unavailable." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
