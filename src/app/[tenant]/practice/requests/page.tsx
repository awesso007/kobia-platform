import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { createDocumentRequestAction } from "@/app/actions/portal-actions";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  OPEN: "bg-sky-100 text-sky-800",
  PARTIAL: "bg-amber-100 text-amber-800",
  COMPLETE: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-slate-100 text-slate-600",
};

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

export default async function RequestsPage({
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
    ...(filter !== "ALL"
      ? { status: filter as "OPEN" | "PARTIAL" | "COMPLETE" | "CANCELLED" }
      : {}),
  };

  const [requests, entities, engagements, counts] = await Promise.all([
    db.portalDocumentRequest.findMany({
      where,
      include: {
        items: { select: { id: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.entity.findMany({
      where: { tenantId: auth.tenant.id, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.engagement.findMany({
      where: { tenantId: auth.tenant.id, status: "ACTIVE" },
      select: { id: true, name: true, entityId: true },
      orderBy: { name: "asc" },
    }),
    db.portalDocumentRequest.groupBy({
      by: ["status"],
      where: { tenantId: auth.tenant.id },
      _count: { _all: true },
    }),
  ]);

  const entityById = new Map(entities.map((e) => [e.id, e.name]));
  const total = counts.reduce((s, c) => s + c._count._all, 0);
  const byStatus = new Map(counts.map((c) => [c.status, c._count._all]));

  const filterTabs: { value: string; label: string; count: number }[] = [
    { value: "ALL", label: "All", count: total },
    { value: "OPEN", label: "Open", count: byStatus.get("OPEN") ?? 0 },
    { value: "PARTIAL", label: "Partial", count: byStatus.get("PARTIAL") ?? 0 },
    { value: "COMPLETE", label: "Complete", count: byStatus.get("COMPLETE") ?? 0 },
    { value: "CANCELLED", label: "Cancelled", count: byStatus.get("CANCELLED") ?? 0 },
  ];

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Document requests
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Ask clients to upload tax docs, statements, and source records.
          </p>
        </div>
        <Link
          href={`/${params.tenant}/practice/clients`}
          className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          Portal users →
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        {filterTabs.map((t) => {
          const active = filter === t.value;
          return (
            <Link
              key={t.value}
              href={`/${params.tenant}/practice/requests?status=${t.value}`}
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

      {/* Create form */}
      <details className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-medium text-slate-800">
          + New request
        </summary>
        <form action={createDocumentRequestAction} className="mt-4 grid gap-3">
          <input type="hidden" name="tenantSlug" value={params.tenant} />
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-slate-700">
                Client (entity) *
              </span>
              <select
                name="entityId"
                required
                className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm"
              >
                <option value="">Choose…</option>
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-700">
                Linked engagement (optional)
              </span>
              <select
                name="engagementId"
                className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm"
              >
                <option value="">— None —</option>
                {engagements.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-slate-700">Title *</span>
            <input
              name="title"
              required
              maxLength={200}
              placeholder="2025 Tax Documents"
              className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm"
            />
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-slate-700">
                Due date (optional)
              </span>
              <input
                name="dueDate"
                type="date"
                className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-700">
                Description
              </span>
              <input
                name="description"
                maxLength={500}
                placeholder="Please upload the following before your filing meeting."
                className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-slate-700">
              Items (one per line) *
            </span>
            <textarea
              name="items"
              required
              rows={6}
              placeholder={
                "W-2 from primary employer\n1099-INT from all banks\nMortgage interest 1098\nProperty tax bill\nCharitable donation receipts"
              }
              className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 font-mono text-xs shadow-sm"
            />
          </label>

          <div className="flex justify-end">
            <button
              type="submit"
              className="rounded-md bg-lime-400 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-lime-300"
            >
              Create request
            </button>
          </div>
        </form>
      </details>

      {/* Requests list */}
      {requests.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
          No requests yet.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Title</th>
                <th className="px-4 py-2 font-medium">Client</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 text-right font-medium">Items</th>
                <th className="px-4 py-2 font-medium">Due</th>
                <th className="px-4 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                const total = r.items.length;
                const done = r.items.filter(
                  (i) => i.status === "RECEIVED" || i.status === "WAIVED"
                ).length;
                return (
                  <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2">
                      <Link
                        href={`/${params.tenant}/practice/requests/${r.id}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {r.title}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-slate-700">
                      {entityById.get(r.entityId) ?? "—"}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-flex rounded-md px-2 py-0.5 text-xs ${
                          STATUS_BADGE[r.status] ?? "bg-slate-100"
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-xs tabular-nums text-slate-600">
                      <span className="font-medium text-slate-900">{done}</span>{" "}
                      / {total}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-600">
                      {fmtDate(r.dueDate)}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-600">
                      {fmtDate(r.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
