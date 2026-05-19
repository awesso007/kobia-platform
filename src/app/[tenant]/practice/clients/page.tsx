import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  inviteClientPortalUserAction,
  deactivatePortalUserAction,
  generatePortalMagicLinkAction,
} from "@/app/actions/portal-actions";

export const dynamic = "force-dynamic";

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

export default async function ClientsPage({
  params,
}: {
  params: { tenant: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const [users, entities] = await Promise.all([
    db.clientPortalUser.findMany({
      where: { tenantId: auth.tenant.id },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    }),
    db.entity.findMany({
      where: { tenantId: auth.tenant.id, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const entityById = new Map(entities.map((e) => [e.id, e.name]));
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  // Pull any freshly-generated magic-link tokens from one-shot cookies
  const cookieJar = cookies();
  const freshLinks: Record<string, string> = {};
  for (const u of users) {
    const c = cookieJar.get(`kobia_last_magic_${u.id}`);
    if (c?.value) {
      freshLinks[u.id] = `${baseUrl}/portal/auth/${c.value}`;
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Client portal users</h1>
          <p className="mt-1 text-sm text-slate-500">
            Invite your clients to upload documents and sign letters securely.
          </p>
        </div>
        <Link
          href={`/${params.tenant}/practice/requests`}
          className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          Document requests →
        </Link>
      </div>

      {/* Invite form */}
      <details className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-medium text-slate-800">
          + Invite client
        </summary>
        <form
          action={inviteClientPortalUserAction}
          className="mt-4 grid gap-3 md:grid-cols-3"
        >
          <input type="hidden" name="tenantSlug" value={params.tenant} />
          <label className="block">
            <span className="text-xs font-medium text-slate-700">
              Entity (client) *
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
            <span className="text-xs font-medium text-slate-700">Name *</span>
            <input
              name="name"
              required
              maxLength={120}
              className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-700">Email *</span>
            <input
              name="email"
              type="email"
              required
              maxLength={200}
              className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm"
            />
          </label>
          <div className="md:col-span-3 flex justify-end">
            <button
              type="submit"
              className="rounded-md bg-lime-400 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-lime-300"
            >
              Invite
            </button>
          </div>
        </form>
      </details>

      {/* User table */}
      {users.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
          No portal users yet. Invite your first client above.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Client</th>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Entity</th>
                <th className="px-4 py-2 font-medium">Last login</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-900">
                    {u.name}
                  </td>
                  <td className="px-4 py-2 text-slate-700">{u.email}</td>
                  <td className="px-4 py-2 text-slate-700">
                    {entityById.get(u.entityId) ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-600">
                    {fmtDate(u.lastLoginAt)}
                  </td>
                  <td className="px-4 py-2">
                    {u.isActive ? (
                      <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
                        Active
                      </span>
                    ) : (
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        Disabled
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {u.isActive && (
                        <>
                          <form
                            action={generatePortalMagicLinkAction}
                            className="inline"
                          >
                            <input
                              type="hidden"
                              name="tenantSlug"
                              value={params.tenant}
                            />
                            <input
                              type="hidden"
                              name="portalUserId"
                              value={u.id}
                            />
                            <button
                              type="submit"
                              className="text-xs font-medium text-sky-600 hover:underline"
                            >
                              Get sign-in link
                            </button>
                          </form>
                          <form
                            action={deactivatePortalUserAction}
                            className="inline"
                          >
                            <input
                              type="hidden"
                              name="tenantSlug"
                              value={params.tenant}
                            />
                            <input type="hidden" name="id" value={u.id} />
                            <button
                              type="submit"
                              className="text-xs font-medium text-rose-600 hover:underline"
                            >
                              Disable
                            </button>
                          </form>
                        </>
                      )}
                    </div>
                    {freshLinks[u.id] && (
                      <div className="mt-2 rounded border border-emerald-200 bg-emerald-50 p-2 text-left text-[10px] text-emerald-900">
                        <p className="font-semibold">Sign-in link (copy now)</p>
                        <a
                          href={freshLinks[u.id]}
                          className="break-all underline"
                          target="_blank"
                          rel="noreferrer"
                        >
                          {freshLinks[u.id]}
                        </a>
                      </div>
                    )}
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
