import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function EmailSettingsPage({
  params,
}: {
  params: { tenant: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const hasResend = Boolean(process.env.RESEND_API_KEY);
  const fromAddr = process.env.EMAIL_FROM ?? "KOBIA Accounting <noreply@kobia.ai>";

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-bold text-slate-900">Email</h1>
      <p className="mt-1 text-sm text-slate-500">
        Outbound email delivery for invoices, statements, reminders, and portal invites.
      </p>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-900">Delivery health</h2>
        <div className="mt-3 flex items-center gap-3">
          {hasResend ? (
            <>
              <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-sm text-slate-700">
                Connected to Resend. Emails will be delivered.
              </span>
            </>
          ) : (
            <>
              <span className="inline-flex h-2 w-2 rounded-full bg-amber-500" />
              <span className="text-sm text-slate-700">
                Email is in stub mode. Messages are logged but not delivered.
              </span>
            </>
          )}
        </div>
        {!hasResend ? (
          <p className="mt-2 text-xs text-slate-500">
            Set <code className="rounded bg-slate-100 px-1">RESEND_API_KEY</code> in your environment
            to enable real delivery.
          </p>
        ) : null}
      </section>

      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-900">From address</h2>
        <p className="mt-2 text-sm text-slate-600">{fromAddr}</p>
        <p className="mt-2 text-xs text-slate-500">
          Set <code className="rounded bg-slate-100 px-1">EMAIL_FROM</code> in your environment to
          customize. Per-tenant from-address support is coming soon.
        </p>
      </section>

      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-900">Email features</h2>
        <ul className="mt-3 space-y-2 text-sm text-slate-700">
          <li className="flex items-start gap-2">
            <span className={hasResend ? "text-emerald-600" : "text-slate-400"}>●</span>
            Send invoices to customers
          </li>
          <li className="flex items-start gap-2">
            <span className={hasResend ? "text-emerald-600" : "text-slate-400"}>●</span>
            Mail customer statements
          </li>
          <li className="flex items-start gap-2">
            <span className={hasResend ? "text-emerald-600" : "text-slate-400"}>●</span>
            Automated reminders for overdue AR
          </li>
          <li className="flex items-start gap-2">
            <span className={hasResend ? "text-emerald-600" : "text-slate-400"}>●</span>
            Client portal invitations
          </li>
          <li className="flex items-start gap-2">
            <span className={hasResend ? "text-emerald-600" : "text-slate-400"}>●</span>
            Engagement letter delivery
          </li>
        </ul>
      </section>
    </div>
  );
}
