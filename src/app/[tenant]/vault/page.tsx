import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  createVaultDocument,
  deleteVaultDocument,
} from "@/app/actions/vault-actions";

export const dynamic = "force-dynamic";

const CATEGORIES = [
  "CONTRACT",
  "TAX",
  "FINANCIAL",
  "LEGAL",
  "HR",
  "RECEIPT",
  "OTHER",
] as const;

const CATEGORY_LABEL: Record<string, string> = {
  CONTRACT: "Contract",
  TAX: "Tax",
  FINANCIAL: "Financial",
  LEGAL: "Legal",
  HR: "HR",
  RECEIPT: "Receipt",
  OTHER: "Other",
};

const CATEGORY_TINT: Record<string, string> = {
  CONTRACT: "bg-violet-50 text-violet-700",
  TAX: "bg-amber-50 text-amber-700",
  FINANCIAL: "bg-emerald-50 text-emerald-700",
  LEGAL: "bg-rose-50 text-rose-700",
  HR: "bg-sky-50 text-sky-700",
  RECEIPT: "bg-slate-100 text-slate-700",
  OTHER: "bg-slate-50 text-slate-600",
};

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

export default async function VaultPage({
  params,
  searchParams,
}: {
  params: { tenant: string };
  searchParams?: { category?: string; q?: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);
  const { tenant } = auth;

  const filterCategory = searchParams?.category;
  const q = searchParams?.q?.trim();

  const [entities, customers, vendors, docs] = await Promise.all([
    db.entity
      .findMany({ where: { tenantId: tenant.id }, orderBy: { name: "asc" }, take: 100 })
      .catch(() => []),
    db.customer
      .findMany({ where: { tenantId: tenant.id }, orderBy: { name: "asc" }, take: 100 })
      .catch(() => []),
    db.vendor
      .findMany({ where: { tenantId: tenant.id }, orderBy: { name: "asc" }, take: 100 })
      .catch(() => []),
    db.vaultDocument
      .findMany({
        where: {
          tenantId: tenant.id,
          ...(filterCategory && CATEGORIES.includes(filterCategory as (typeof CATEGORIES)[number])
            ? { category: filterCategory as (typeof CATEGORIES)[number] }
            : {}),
          ...(q
            ? {
                OR: [
                  { title: { contains: q, mode: "insensitive" as const } },
                  { description: { contains: q, mode: "insensitive" as const } },
                  { tags: { contains: q, mode: "insensitive" as const } },
                ],
              }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      })
      .catch(() => []),
  ]);

  const entityMap = new Map(entities.map((e) => [e.id, e.name]));
  const customerMap = new Map(customers.map((c) => [c.id, c.name]));
  const vendorMap = new Map(vendors.map((v) => [v.id, v.name]));

  const now = Date.now();
  const expiringSoon = docs.filter(
    (d) => d.expiresAt && new Date(d.expiresAt).getTime() < now + 30 * 86400000,
  ).length;

  return (
    <div className="px-6 py-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Document Vault</h1>
          <p className="mt-1 text-sm text-slate-500">
            Central library for contracts, tax docs, receipts, and any other
            files. Link from Drive, Dropbox, Box, or any URL.
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Total documents" value={docs.length} />
        <KpiCard
          label="With clients linked"
          value={docs.filter((d) => d.entityId || d.customerId || d.vendorId).length}
        />
        <KpiCard label="Expiring in 30 days" value={expiringSoon} />
      </div>

      <details className="mt-6 rounded-lg border border-slate-200 bg-white p-5" open>
        <summary className="cursor-pointer text-sm font-semibold text-slate-900">
          Add a document
        </summary>
        <form
          action={createVaultDocument.bind(null, params.tenant)}
          className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600">Title</label>
            <input
              name="title"
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="e.g., 2025 Engagement Letter"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600">URL</label>
            <input
              name="url"
              required
              type="url"
              placeholder="https://drive.google.com/file/..."
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Category</label>
            <select
              name="category"
              defaultValue="OTHER"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">
              Expires (optional)
            </label>
            <input
              name="expiresAt"
              type="date"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">
              Client business (optional)
            </label>
            <select
              name="entityId"
              defaultValue=""
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">—</option>
              {entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">
              Customer (optional)
            </label>
            <select
              name="customerId"
              defaultValue=""
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">—</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">
              Vendor (optional)
            </label>
            <select
              name="vendorId"
              defaultValue=""
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">—</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">
              Tags (comma-separated)
            </label>
            <input
              name="tags"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600">
              Description (optional)
            </label>
            <textarea
              name="description"
              rows={2}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2 text-right">
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Save document
            </button>
          </div>
        </form>
      </details>

      <div className="mt-6">
        <form className="flex flex-wrap items-center gap-2">
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search title, description, tags"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            name="category"
            defaultValue={filterCategory ?? ""}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
          >
            Filter
          </button>
          {(filterCategory || q) && (
            <Link
              href={`/${params.tenant}/vault`}
              className="text-sm text-slate-500 hover:text-slate-700"
            >
              Clear
            </Link>
          )}
        </form>
      </div>

      <div className="mt-6">
        {docs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
            No documents yet. Add your first link above.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">Title</th>
                  <th className="px-4 py-2">Category</th>
                  <th className="px-4 py-2">Linked to</th>
                  <th className="px-4 py-2">Expires</th>
                  <th className="px-4 py-2">Added</th>
                  <th className="px-4 py-2 text-right">Manage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {docs.map((d) => {
                  const linked = [
                    d.entityId ? entityMap.get(d.entityId) : null,
                    d.customerId ? customerMap.get(d.customerId) : null,
                    d.vendorId ? vendorMap.get(d.vendorId) : null,
                  ].filter(Boolean);
                  return (
                    <tr key={d.id}>
                      <td className="px-4 py-2">
                        <a
                          href={d.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-slate-900 hover:text-slate-700"
                        >
                          {d.title}
                        </a>
                        {d.description ? (
                          <div className="text-xs text-slate-500">
                            {d.description}
                          </div>
                        ) : null}
                        {d.tags ? (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {d.tags.split(",").map((t) => (
                              <span
                                key={t}
                                className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600"
                              >
                                {t.trim()}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_TINT[d.category] ?? "bg-slate-100 text-slate-600"}`}
                        >
                          {CATEGORY_LABEL[d.category] ?? d.category}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-slate-600">
                        {linked.length > 0 ? linked.join(" · ") : "—"}
                      </td>
                      <td className="px-4 py-2 text-slate-600">
                        {fmtDate(d.expiresAt)}
                      </td>
                      <td className="px-4 py-2 text-slate-500">
                        {fmtDate(d.createdAt)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <form
                          action={deleteVaultDocument.bind(null, params.tenant)}
                          className="inline"
                        >
                          <input type="hidden" name="id" value={d.id} />
                          <button
                            type="submit"
                            className="rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
                          >
                            Remove
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}
