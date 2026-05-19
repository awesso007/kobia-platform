import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  markItemStatusAction,
  updateRequestStatusAction,
} from "@/app/actions/portal-actions";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  OPEN: "bg-sky-100 text-sky-800",
  PARTIAL: "bg-amber-100 text-amber-800",
  COMPLETE: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-slate-100 text-slate-600",
};

const ITEM_BADGE: Record<string, string> = {
  NEEDED: "bg-slate-100 text-slate-700",
  RECEIVED: "bg-emerald-100 text-emerald-800",
  WAIVED: "bg-slate-200 text-slate-600",
};

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

export default async function RequestDetailPage({
  params,
}: {
  params: { tenant: string; id: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const request = await db.portalDocumentRequest.findFirst({
    where: { id: params.id, tenantId: auth.tenant.id },
    include: {
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          uploads: {
            orderBy: { createdAt: "desc" },
            include: {
              portalUser: { select: { name: true, email: true } },
            },
          },
        },
      },
    },
  });
  if (!request) notFound();

  const entity = await db.entity.findUnique({
    where: { id: request.entityId },
    select: { name: true },
  });

  const total = request.items.length;
  const done = request.items.filter(
    (i) => i.status === "RECEIVED" || i.status === "WAIVED"
  ).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-3 flex items-center gap-2 text-sm text-slate-500">
        <Link
          href={`/${params.tenant}/practice/requests`}
          className="hover:underline"
        >
          Requests
        </Link>
        <span>/</span>
        <span className="text-slate-700">{request.title}</span>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{request.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Client:{" "}
            <span className="font-medium text-slate-700">
              {entity?.name ?? "—"}
            </span>{" "}
            · Due {fmtDate(request.dueDate)}
          </p>
          {request.description && (
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              {request.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-md px-2 py-1 text-xs font-semibold ${
              STATUS_BADGE[request.status] ?? "bg-slate-100"
            }`}
          >
            {request.status}
          </span>
          <form action={updateRequestStatusAction}>
            <input type="hidden" name="tenantSlug" value={params.tenant} />
            <input type="hidden" name="id" value={request.id} />
            <select
              name="status"
              defaultValue={request.status}
              className="rounded-md border-slate-300 px-2 py-1 text-xs"
              // Auto-submit on change via inline form submit button below
            >
              <option value="OPEN">Open</option>
              <option value="PARTIAL">Partial</option>
              <option value="COMPLETE">Complete</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
            <button
              type="submit"
              className="ml-2 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Set
            </button>
          </form>
        </div>
      </div>

      {/* Progress */}
      <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-slate-700">
            {done} of {total} items complete
          </span>
          <span className="text-xs text-slate-500">{pct}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full bg-lime-400 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Items */}
      <div className="mt-6 space-y-3">
        {request.items.map((item) => (
          <div
            key={item.id}
            className="rounded-lg border border-slate-200 bg-white p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex rounded-md px-2 py-0.5 text-xs ${
                      ITEM_BADGE[item.status] ?? "bg-slate-100"
                    }`}
                  >
                    {item.status}
                  </span>
                  <p className="text-sm font-medium text-slate-900">
                    {item.label}
                  </p>
                </div>
                {item.notes && (
                  <p className="mt-1 text-xs text-slate-500">{item.notes}</p>
                )}
              </div>
              <div className="flex items-center gap-1">
                {(["NEEDED", "RECEIVED", "WAIVED"] as const).map((s) => (
                  <form key={s} action={markItemStatusAction}>
                    <input
                      type="hidden"
                      name="tenantSlug"
                      value={params.tenant}
                    />
                    <input type="hidden" name="id" value={item.id} />
                    <input type="hidden" name="status" value={s} />
                    <button
                      type="submit"
                      disabled={item.status === s}
                      className={`rounded px-2 py-1 text-[10px] font-medium ${
                        item.status === s
                          ? "bg-slate-900 text-white"
                          : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                      } disabled:cursor-default`}
                    >
                      {s}
                    </button>
                  </form>
                ))}
              </div>
            </div>

            {item.uploads.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {item.uploads.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs"
                  >
                    <a
                      href={u.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-sky-700 hover:underline"
                    >
                      {u.fileName}
                    </a>
                    <span className="text-slate-500">
                      {u.portalUser?.name ?? "—"} · {fmtDate(u.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
