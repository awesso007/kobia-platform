/**
 * Tenant-registry Stripe billing callback quarantine (Round 48).
 *
 * The former handler used caller-supplied checkout metadata for plan changes,
 * wrote duplicate events without a unique receipt, accepted out-of-order
 * subscription updates and swallowed event-log errors. A Stripe signature
 * proves delivery, NOT idempotency, current customer/tenant binding or paid
 * settlement. Do not mutate tenant subscription data from that prototype.
 *
 * A replacement must use a unique provider event receipt, atomic tenant-bound
 * writes, verified price/customer/amount, ordering and protected acceptance.
 * The actual provider adapter is not approved; no runtime flag can reenable
 * this legacy endpoint without code review.
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  return NextResponse.json(
    { ok: false, error: "Legacy billing webhook unavailable." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
