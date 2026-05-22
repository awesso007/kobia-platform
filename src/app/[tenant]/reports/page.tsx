import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Report = {
  title: string;
  description: string;
  href: string;
  category: string;
};

const REPORTS: Report[] = [
  // Financial statements
  {
    category: "Financial Statements",
    title: "Profit & Loss",
    description: "Income statement by period — CSV-exportable.",
    href: "/books/reports/profit-loss",
  },
  {
    category: "Financial Statements",
    title: "Balance Sheet",
    description: "Assets, liabilities, and equity as of date.",
    href: "/books/reports/balance-sheet",
  },
  {
    category: "Financial Statements",
    title: "Cash Flow",
    description: "Operating, investing, and financing activity.",
    href: "/books/reports/cash-flow",
  },
  {
    category: "Financial Statements",
    title: "Trial Balance",
    description: "All accounts with debit/credit balances. Exports to CSV.",
    href: "/books/reports/trial-balance",
  },
  {
    category: "Financial Statements",
    title: "General Ledger",
    description: "Transaction-level account detail. Exports to CSV.",
    href: "/books/reports/general-ledger",
  },
  {
    category: "Financial Statements",
    title: "Budget vs Actual",
    description: "Variance report against your budget.",
    href: "/books/reports/budget-vs-actual",
  },
  {
    category: "Financial Statements",
    title: "Class / Project P&L",
    description: "Profit & loss split by class or project.",
    href: "/books/reports/class-pnl",
  },

  // AR / AP
  {
    category: "Receivables & Payables",
    title: "AR Aging",
    description: "Open invoices by age bucket.",
    href: "/books/reports/ar-aging",
  },
  {
    category: "Receivables & Payables",
    title: "AP Aging",
    description: "Open bills by age bucket.",
    href: "/books/reports/ap-aging",
  },
  {
    category: "Receivables & Payables",
    title: "Customer Statements",
    description: "Statement runs you can email or download.",
    href: "/books/customer-statements",
  },

  // Tax
  {
    category: "Tax",
    title: "1099-NEC",
    description: "Year-end 1099-NEC for contractors. CSV export.",
    href: "/tax/1099",
  },
  {
    category: "Tax",
    title: "1099-MISC",
    description: "Year-end 1099-MISC. CSV export.",
    href: "/tax/1099-misc",
  },
  {
    category: "Tax",
    title: "W-2 / 941 / 940",
    description: "Payroll tax reports.",
    href: "/tax/payroll-forms",
  },
  {
    category: "Tax",
    title: "Sales Tax",
    description: "Sales tax collected by jurisdiction.",
    href: "/tax/sales-tax",
  },
  {
    category: "Tax",
    title: "Withholding",
    description: "Employee withholding summary.",
    href: "/tax/withholding",
  },

  // Practice
  {
    category: "Practice",
    title: "Time by Engagement",
    description: "Billable vs non-billable hours per client.",
    href: "/time",
  },
  {
    category: "Practice",
    title: "Engagement Status",
    description: "Active engagements and task progress.",
    href: "/practice",
  },

  // Inventory & Items
  {
    category: "Inventory",
    title: "Inventory Movements",
    description: "All stock additions and reductions.",
    href: "/books/reports/inventory-movements",
  },
  {
    category: "Inventory",
    title: "Items Catalog",
    description: "Products & services with cost and price.",
    href: "/books/items",
  },

  // SaaS / KPI
  {
    category: "Metrics",
    title: "SaaS Metrics",
    description: "MRR, ARR, churn — for subscription businesses.",
    href: "/books/saas-metrics",
  },
  {
    category: "Metrics",
    title: "Dashboard KPIs",
    description: "Open AR, AP, cash, pipeline at a glance.",
    href: "/dashboard",
  },
];

export default async function ReportsHubPage({
  params,
}: {
  params: { tenant: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const byCategory = REPORTS.reduce<Record<string, Report[]>>((acc, r) => {
    if (!acc[r.category]) acc[r.category] = [];
    acc[r.category]!.push(r);
    return acc;
  }, {});

  const categoryOrder = [
    "Financial Statements",
    "Receivables & Payables",
    "Tax",
    "Practice",
    "Inventory",
    "Metrics",
  ];

  return (
    <div className="px-6 py-6">
      <h1 className="text-2xl font-semibold text-slate-900">Reports</h1>
      <p className="mt-1 text-sm text-slate-500">
        Every report in one place. Each report supports view, filter, and CSV
        export where applicable.
      </p>

      <div className="mt-6 space-y-8">
        {categoryOrder
          .filter((c) => byCategory[c])
          .map((cat) => (
            <section key={cat}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                {cat}
              </h2>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {byCategory[cat]!.map((r) => (
                  <Link
                    key={r.href}
                    href={`/${params.tenant}${r.href}`}
                    className="block rounded-lg border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm"
                  >
                    <div className="font-medium text-slate-900">{r.title}</div>
                    <div className="mt-1 text-sm text-slate-500">
                      {r.description}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
      </div>
    </div>
  );
}
