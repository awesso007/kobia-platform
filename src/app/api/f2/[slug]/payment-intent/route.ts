/*
 * Public Forms 2.0 payment endpoint (Sprint 19). Unauthenticated, CORS-open.
 * Given a PENDING submission id, this would create a Stripe PaymentIntent. When
 * Stripe is not configured (the v0.1 default) it falls back to the stub scaffold:
 * it marks the submission PAID immediately, records PAYMENT_SUCCESS, and
 * dispatches FORM_V2_PAID. The client shows a "Pay $X" button that calls this and
 * moves on. Tenant via `?t=<slug>`.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantPrisma, schemaNameForSlug } from "@/lib/db/tenant-prisma";
import { markSubmissionPaid } from "@/lib/forms2/mutations";

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

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest, _ctx: { params: { slug: string } }) {
  const tenantSlug = sanitizeSlug(req.nextUrl.searchParams.get("t"));
  if (!tenantSlug) {
    return NextResponse.json({ ok: false, error: "Missing or invalid tenant." }, { status: 400, headers: CORS });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid body." }, { status: 400, headers: CORS });
  }
  const submissionId = String(body.submissionId ?? "");
  if (!submissionId) {
    return NextResponse.json({ ok: false, error: "submissionId is required." }, { status: 400, headers: CORS });
  }

  const stripeConfigured = !!process.env.STRIPE_SECRET_KEY;

  try {
    const db = getTenantPrisma(schemaNameForSlug(tenantSlug));
    const submission = await db.formV2Submission.findUnique({ where: { id: submissionId } });
    if (!submission) return NextResponse.json({ ok: false, error: "Unknown submission." }, { status: 404, headers: CORS });

    await db.formV2Analytics.create({ data: { formId: submission.formId, event: "PAYMENT_INIT" } }).catch(() => undefined);

    if (!stripeConfigured) {
      // Stub scaffold: no live Stripe, so settle immediately.
      await markSubmissionPaid(db, submissionId, `stub_${submissionId}`);
      return NextResponse.json(
        { ok: true, paid: true, clientSecret: null, stub: true, amountCents: submission.amountCents, currency: submission.currency },
        { status: 200, headers: CORS },
      );
    }

    // Live Stripe would create a PaymentIntent here and return its client secret;
    // confirmation would settle the submission via a webhook. Not wired for v0.1.
    return NextResponse.json(
      { ok: true, paid: false, clientSecret: null, stub: false, amountCents: submission.amountCents, currency: submission.currency },
      { status: 200, headers: CORS },
    );
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500, headers: CORS });
  }
}
