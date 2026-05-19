import { redirect } from "next/navigation";
import { getPortalSession } from "@/lib/portal/session";
import { db } from "@/lib/db";
import {
  uploadPortalDocumentAction,
  portalSignOutAction,
} from "@/app/actions/portal-actions";

export const dynamic = "force-dynamic";

const ITEM_BADGE: Record<string, string> = {
  NEEDED: "bg-amber-100 text-amber-800",
  RECEIVED: "bg-emerald-100 text-emerald-800",
  WAIVED: "bg-slate-200 text-slate-600",
};

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

export default async function PortalDashboard() {
  const session = await getPortalSession();
  if (!session) redirect("/portal/login");

  const { portalUser } = session;

  const [tenant, entity, requests, recentUploads] = await Promise.all([
    db.tenant.findUnique({
      where: { id: session.tenantId },
      select: { name: true, primaryColor: true, logoUrl: true },
    }),
    db.entity.findUnique({
      where: { id: portalUser.entityId },
      select: { name: true },
    }),
    db.portalDocumentRequest.findMany({
      where: {
        tenantId: session.tenantId,
        entityId: portalUser.entityId,
        status: { in: ["OPEN", "PARTIAL"] },
      },
      include: {
        items: {
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    }),
    db.portalUpload.findMany({
      where: {
        tenantId: session.tenantId,
        entityId: portalUser.entityId,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const firmName = tenant?.name ?? "Your firm";
  const accent = tenant?.primaryColor ?? "#0F172A";

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            {tenant?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={tenant.logoUrl}
                alt={firmName}
                className="h-8 w-8 rounded object-contain"
              />
            ) : (
              <div
                className="flex h-8 w-8 items-center justify-center rounded text-sm font-semibold text-white"
                style={{ background: accent }}
              >
                {firmName.charAt(0)}
              </div>
            )}
            <div>
              <p className="text-sm font-semibold text-slate-900">{firmName}</p>
              <p className="text-xs text-slate-500">Client portal</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-600">
            <span>
              {portalUser.name} · {entity?.name ?? ""}
            </span>
            <form action={portalSignOutAction}>
              <button
                type="submit"
                className="rounded border border-slate-200 px-2 py-1 hover:bg-slate-50"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-2xl font-bold text-slate-900">
          Welcome, {portalUser.name.split(" ")[0]}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Upload requested documents and review what you&rsquo;ve sent.
        </p>

        {/* Active requests */}
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Action needed
          </h2>

          {requests.length === 0 ? (
            <div className="mt-3 rounded-lg border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
              You&rsquo;re all caught up. No pending document requests.
            </div>
          ) : (
            <div className="mt-3 space-y-4">
              {requests.map((r) => {
                const total = r.items.length;
                const done = r.items.filter(
                  (i) => i.status === "RECEIVED" || i.status === "WAIVED"
                ).length;
                const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                return (
                  <div
                    key={r.id}
                    className="rounded-lg border border-slate-200 bg-white p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-semibold text-slate-900">
                            {r.title}
                          </h3>
                          <span
                            className={`rounded-md px-2 py-0.5 text-xs ${
                              STATUS_BADGE[r.status] ?? "bg-slate-100"
                            }`}
                          >
                            {r.status}
                          </span>
                        </div>
                        {r.description && (
                          <p className="mt-1 text-sm text-slate-600">
                            {r.description}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-slate-500">
                          Due {fmtDate(r.dueDate)} ·{" "}
                          <span className="font-medium text-slate-700">
                            {done}/{total} complete
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full bg-lime-400 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    <div className="mt-4 space-y-3">
                      {r.items.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-md border border-slate-100 p-3"
                        >
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

                          {item.status === "NEEDED" && (
                            <form
                              action={uploadPortalDocumentAction}
                              className="mt-3 grid gap-2 md:grid-cols-3"
                            >
                              <input
                                type="hidden"
                                name="requestItemId"
                                value={item.id}
                              />
                              <input
                                name="fileName"
                                required
                                maxLength={200}
                                placeholder="W-2-2025.pdf"
                                className="rounded-md border-slate-300 px-3 py-1.5 text-xs shadow-sm"
                              />
                              <input
                                name="fileUrl"
                                required
                                type="url"
                                maxLength={500}
                                placeholder="https://drive.google.com/…"
                                className="rounded-md border-slate-300 px-3 py-1.5 text-xs shadow-sm"
                              />
                              <button
                                type="submit"
                                className="rounded-md bg-lime-400 px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-lime-300"
                              >
                                Submit
                              </button>
                            </form>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Free upload (not tied to a request) */}
        <section className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Send a document
          </h2>
          <form
            action={uploadPortalDocumentAction}
            className="mt-3 grid gap-2 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-4"
          >
            <input
              name="fileName"
              required
              maxLength={200}
              placeholder="File name"
              className="rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm"
            />
            <input
              name="fileUrl"
              required
              type="url"
              maxLength={500}
              placeholder="Public file URL"
              className="rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm md:col-span-2"
            />
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Send
            </button>
          </form>
        </section>

        {/* Recent uploads */}
        <section className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Recent uploads
          </h2>
          {recentUploads.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              You haven&rsquo;t uploaded anything yet.
            </p>
          ) : (
            <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">File</th>
                    <th className="px-4 py-2 font-medium">When</th>
                  </tr>
                </thead>
                <tbody>
                  {recentUploads.map((u) => (
                    <tr key={u.id} className="border-t border-slate-100">
                      <td className="px-4 py-2">
                        <a
                          href={u.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-sky-700 hover:underline"
                        >
                          {u.fileName}
                        </a>
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-600">
                        {fmtDate(u.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
