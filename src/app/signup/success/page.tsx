import Link from "next/link";
import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { provisionTenantFromPending } from "@/app/actions/signup-actions";

export const dynamic = "force-dynamic";

export default async function SignupSuccessPage({
  searchParams,
}: {
  searchParams: { session_id?: string; tenant?: string };
}) {
  let tenantSlug: string | null = searchParams.tenant ?? null;
  let pendingStatus: "pending" | "ready" | "error" = "ready";
  let errorMsg: string | null = null;

  // Paid signup: resolve via Stripe session_id (webhook may have already provisioned)
  if (!tenantSlug && searchParams.session_id) {
    try {
      const session = await stripe.checkout.sessions.retrieve(searchParams.session_id);
      const pendingId = session.metadata?.pendingTenantId;
      if (pendingId) {
        const pending = await db.pendingTenant.findUnique({ where: { id: pendingId } });
        if (pending) {
          // Webhook may not have fired yet — provision inline as fallback (idempotent).
          if (pending.status !== "COMPLETED" && session.payment_status === "paid") {
            const tenant = await provisionTenantFromPending(pending.id);
            tenantSlug = tenant.slug;
            // Attach customer + hide brand for paid tiers
            await db.tenant.update({
              where: { id: tenant.id },
              data: {
                stripeCustomerId: typeof session.customer === "string" ? session.customer : undefined,
                hideKobiaBrand: pending.tier !== "FREE" && pending.tier !== "ENTRY",
              },
            });
          } else if (pending.provisionedTenantId) {
            const t = await db.tenant.findUnique({ where: { id: pending.provisionedTenantId } });
            tenantSlug = t?.slug ?? null;
          } else {
            pendingStatus = "pending";
          }
        }
      }
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : "Could not verify payment.";
      pendingStatus = "error";
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-white p-6">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        {pendingStatus === "ready" && tenantSlug ? (
          <>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckIcon />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">You&apos;re in.</h1>
            <p className="mt-2 text-sm text-slate-600">
              Your KOBIA workspace is ready at{" "}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">/{tenantSlug}</code>.
            </p>
            <Link
              href={`/${tenantSlug}/login`}
              className="mt-6 inline-block rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Sign in to your workspace
            </Link>
            <p className="mt-4 text-xs text-slate-500">
              We&apos;ll use Clerk for sign-in. First time? You&apos;ll create your password there.
            </p>
          </>
        ) : pendingStatus === "pending" ? (
          <>
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900" />
            <h1 className="text-xl font-semibold text-slate-900">Setting up your workspace…</h1>
            <p className="mt-2 text-sm text-slate-600">
              Your payment is confirmed. We&apos;re provisioning your workspace right now.
            </p>
            <p className="mt-4 text-xs text-slate-500">
              Refresh this page in a few seconds. If it doesn&apos;t resolve in 60 seconds,{" "}
              <a href="mailto:hello@kobia.ai" className="underline">
                email us
              </a>
              .
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-slate-900">Something didn&apos;t quite work</h1>
            <p className="mt-2 text-sm text-slate-600">
              {errorMsg ?? "We couldn't verify your signup."}
            </p>
            <p className="mt-4 text-xs text-slate-500">
              Don&apos;t worry — if you were charged, the webhook will provision your workspace
              within a minute.{" "}
              <a href="mailto:hello@kobia.ai" className="underline">
                Contact support
              </a>{" "}
              if you need a hand.
            </p>
          </>
        )}
      </div>
    </main>
  );
}

function CheckIcon() {
  return (
    <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}
