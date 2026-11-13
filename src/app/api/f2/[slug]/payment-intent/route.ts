/**
 * Public Forms 2.0 payment initiation is intentionally DISABLED.
 *
 * The former prototype marked submissions PAID without receiving settlement
 * when STRIPE_SECRET_KEY was absent. A payment provider configuration alone is
 * not sufficient to establish a verified, tenant-bound payment receipt.
 * Do not perform any database writes or release a clientSecret until there is
 * a reviewed, idempotent provider intent + verified webhook implementation.
 *
 * This is separate from CHESS billing approvals. No demo/stub settlement.
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

export function OPTIONS(): NextResponse {
  return new NextResponse(null, { status: 204, headers: HEADERS });
}

export async function POST(): Promise<NextResponse> {
  // Deliberately uniform response. Do not reveal whether an unknown
  // submission ID or tenant exists, nor confirm payment based on caller input.
  return NextResponse.json(
    { ok: false, paid: false, error: "Payment processing is not available." },
    { status: 503, headers: HEADERS },
  );
}
