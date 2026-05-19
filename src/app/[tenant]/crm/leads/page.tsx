import Link from "next/link";
import { redirect } from "next/navigation";
import type { LeadStatus } from "@prisma/client";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { createLeadAction } from "@/app/actions/crm-actions";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  NEW: "bg-sky-100 text-sky-800",
  CONTACTED: "bg-indigo-100 text-indigo-800",
  QUALIFIED: "bg-amber-100 text-amber-800",
  CONVERTED: "bg-emerald-100 text-emerald-800",
  UNQUALIFIED: "bg-slate-200 text-slate-700",
};

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

export default async function LeadsPage({
  params,
  searchParams,
}: {
  params: { tenant: string };
  searchParams?: { status?: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const filter = searchParams?.status ?? "ALL";

  const where = {
    tenantId: auth.tenant.id,
    ...(filter !== "ALL" ? { status: filter as LeadStatus } : {}),
  };

  const [leads, counts] = await Promise.all([
    db.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.lead.groupBy({
      by: ["status"],
      where: { tenantId: auth.tenant.id },
      _count: { _all: true },
    }),
  ]);

  const total = counts.reduce((s, c) => s + c._count._all, 0);
  const byStatus = new Map(counts.map((c) => [c.status, c._count._all]));

  const filterTabs: { value: string; label: string; count: number }[] = [
    { value: "ALL", label: "All", count: total },
    { value: "NEW", label: "New", count: byStatus.get("NEW") ?? 0 },
    {
      value: "CONTACTED",
      label: "Contacted",
      count: byStatus.get("CONTACTED") ?? 0,
    },
    {
      value: "QUALIFIED",
      label: "Qualified",
      count: byStatus.get("QUALIFIED") ?? 0,
    },
    {
      value: "CONVERTED",
      label: "Converted",
      count: byStatus.get("CONVERTED") ?? 0,
    },
    {
      value: "UNQUALIFIED",
      label: "Unqualified",
      count: byStatus.get("UNQUALIFIED") ?? 0,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Leads</h1>
          <p className="mt-1 text-sm text-slate-500">
            Inbound prospects before they become deals.
          </p>
        </div>
        <Link
          href={`/${params.tenant}/crm`}
          className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          ← Pipeline
        </Link>
      </div>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Add a lead</h2>
        <form
          action={createLeadAction}
          className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3"
        >
          <input type="hidden" name="tenantSlug" value={params.tenant} />
          <div>
            <label className="block text-xs text-slate-600">Name *</label>
            <input
              required
              name="name"
              type="text"
              className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
              placeholder="Contact name"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-600">Company</label>
            <input
              name="companyName"
              type="text"
              className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-600">Email</label>
            <input
              name="email"
              type="email"
              className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-600">Phone</label>
            <input
              name="phone"
              type="tel"
              className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-600">Source</label>
            <select
              name="source"
              defaultValue="WEBSITE"
              className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            >
              <option value="WEBSITE">Website</option>
              <option value="REFERRAL">Referral</option>
              <option value="COLD_OUTREACH">Cold outreach</option>
              <option value="EVENT">Event</option>
              <option value="PARTNER">Partner</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-600">Notes</label>
            <input
              name="notes"
              type="text"
              className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
              placeholder="Short note"
            />
          </div>
          <div className="md:col-span-3 flex justify-end">
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Add lead
            </button>
          </div>
        </form>
      </div>

      <div className="mt-6 flex flex-wrap gap-2 text-xs">
        {filterTabs.map((t) => {
          const active = filter === t.value;
          return (
            <Link
              key={t.value}
              href={`/${params.tenant}/crm/leads?status=${t.value}`}
              className={`rounded-full px-3 py-1 ${
                active
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {t.label} · {t.count}
            </Link>
          );
        })}
      </div>

      {leads.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
          No leads {filter !== "ALL" ? `in ${filter.toLowerCase()}` : "yet"}.
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Company</th>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Source</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Added</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr
                  key={l.id}
                  className="border-t border-slate-100 hover:bg-slate-50"
                >
                  <td className="px-4 py-2">
                    <Link
                      href={`/${params.tenant}/crm/leads/${l.id}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {l.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-slate-700">
                    {l.companyName ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-slate-700">
                    {l.email ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-600">
                    {l.source}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-flex rounded-md px-2 py-0.5 text-xs ${
                        STATUS_BADGE[l.status] ?? "bg-slate-100"
                      }`}
                    >
                      {l.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-600">
                    {fmtDate(l.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
