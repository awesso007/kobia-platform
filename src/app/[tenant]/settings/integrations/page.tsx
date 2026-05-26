import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface Integration {
  name: string;
  description: string;
  envKey: string;
  configured: boolean;
  managePath?: string;
  docsUrl?: string;
}

export default async function IntegrationsPage({
  params,
}: {
  params: { tenant: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const integrations: Integration[] = [
    {
      name: "Stripe (KOBIA billing)",
      description: "Powers your KOBIA subscription and seat usage.",
      envKey: "STRIPE_SECRET_KEY",
      configured: Boolean(process.env.STRIPE_SECRET_KEY),
      managePath: `/${params.tenant}/settings/billing`,
    },
    {
      name: "Resend (Email)",
      description: "Transactional email delivery.",
      envKey: "RESEND_API_KEY",
      configured: Boolean(process.env.RESEND_API_KEY),
      managePath: `/${params.tenant}/settings/email`,
    },
    {
      name: "Plaid (Bank feeds)",
      description: "Automatic bank transaction sync. Coming soon.",
      envKey: "PLAID_SECRET",
      configured: Boolean(process.env.PLAID_SECRET),
    },
    {
      name: "Clerk (Auth)",
      description: "User identity and team management.",
      envKey: "CLERK_SECRET_KEY",
      configured: Boolean(process.env.CLERK_SECRET_KEY),
    },
  ];

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold text-slate-900">Integrations</h1>
      <p className="mt-1 text-sm text-slate-500">
        Connected services that power your workspace.
      </p>

      <div className="mt-6 space-y-3">
        {integrations.map((i) => (
          <div
            key={i.name}
            className="flex items-start justify-between rounded-lg border border-slate-200 bg-white p-4"
          >
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium text-slate-900">{i.name}</p>
                {i.configured ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    Connected
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    Not configured
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-slate-500">{i.description}</p>
            </div>
            {i.managePath ? (
              <Link
                href={i.managePath}
                className="text-sm font-medium text-sky-600 hover:text-sky-700"
              >
                Manage →
              </Link>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
