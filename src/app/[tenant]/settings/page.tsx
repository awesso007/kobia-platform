import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";

export const dynamic = "force-dynamic";

const links: { href: (t: string) => string; label: string; description: string }[] = [
  {
    href: (t) => `/${t}/settings/branding`,
    label: "Branding",
    description: "Logo, primary/secondary colors, and workspace name.",
  },
  {
    href: (t) => `/${t}/settings/fiscal`,
    label: "Fiscal Year & Currency",
    description: "Set the year-end date and base currency for each entity.",
  },
  {
    href: (t) => `/${t}/settings/email`,
    label: "Email",
    description: "From address, reply-to, and delivery health.",
  },
  {
    href: (t) => `/${t}/settings/integrations`,
    label: "Integrations",
    description: "Stripe, Plaid, Resend, and external connections.",
  },
  {
    href: (t) => `/${t}/settings/currencies`,
    label: "Exchange Rates",
    description: "Manage exchange rates for multi-currency books.",
  },
  {
    href: (t) => `/${t}/settings/tax-rates`,
    label: "Sales Tax Rates",
    description: "Configure tax rates this entity charges on invoices.",
  },
  {
    href: (t) => `/${t}/settings/approvals`,
    label: "Bill Approvals",
    description: "Set the threshold above which bills require approval.",
  },
  {
    href: (t) => `/${t}/settings/billing`,
    label: "Subscription & Billing",
    description: "Plan, payment method, and seat usage.",
  },
];

export default async function SettingsPage({ params }: { params: { tenant: string } }) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
      <p className="mt-1 text-sm text-slate-500">
        Configure how KOBIA behaves for this workspace.
      </p>
      <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
        {links.map((l) => (
          <Link
            key={l.label}
            href={l.href(params.tenant)}
            className="rounded-lg border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm"
          >
            <p className="font-medium text-slate-900">{l.label}</p>
            <p className="mt-1 text-sm text-slate-500">{l.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
