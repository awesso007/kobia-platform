import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  deleteBillingRateAction,
  upsertBillingRateAction,
} from "@/app/actions/time-actions";

export const dynamic = "force-dynamic";

function fmtMoney(cents: bigint): string {
  const n = Number(cents) / 100;
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

export default async function BillingRatesPage({
  params,
}: {
  params: { tenant: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const [rates, engagements, members] = await Promise.all([
    db.billingRate.findMany({
      where: { tenantId: auth.tenant.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      include: {
        engagement: {
          select: { name: true, entity: { select: { name: true } } },
        },
      },
    }),
    db.engagement.findMany({
      where: { tenantId: auth.tenant.id, status: { not: "CANCELLED" } },
      orderBy: { name: "asc" },
      include: { entity: { select: { name: true } } },
    }),
    db.membership.findMany({
      where: { tenantId: auth.tenant.id },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    }),
  ]);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Billing rates</h1>
          <p className="mt-1 text-sm text-slate-500">
            Set hourly rates by user, by engagement, or as a tenant-wide
            default. Most specific match wins at log time.
          </p>
        </div>
        <Link
          href={`/${params.tenant}/time`}
          className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          ← Time
        </Link>
      </div>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Add or update a rate</h2>
        <form
          action={upsertBillingRateAction}
          className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4"
        >
          <input type="hidden" name="tenantSlug" value={params.tenant} />
          <div>
            <label className="block text-xs text-slate-600">User</label>
            <select
              name="userId"
              defaultValue=""
              className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            >
              <option value="">Any user</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.user.firstName || m.user.lastName
                    ? `${m.user.firstName ?? ""} ${m.user.lastName ?? ""}`.trim()
                    : m.user.email}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-600">Engagement</label>
            <select
              name="engagementId"
              defaultValue=""
              className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            >
              <option value="">Any engagement</option>
              {engagements.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.entity.name} · {e.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-600">Rate ($/hr)</label>
            <input
              required
              name="rate"
              type="text"
              placeholder="150"
              className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                name="isDefault"
                className="rounded border-slate-300"
              />
              Tenant default
              <span className="text-slate-400">(any user + any engagement)</span>
            </label>
          </div>
          <div className="md:col-span-4">
            <label className="block text-xs text-slate-600">Notes</label>
            <input
              name="notes"
              type="text"
              className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="md:col-span-4 flex justify-end">
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Save rate
            </button>
          </div>
        </form>
      </div>

      {rates.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
          No billing rates yet. Add one above to start tracking value on time entries.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Scope</th>
                <th className="px-4 py-2 font-medium">User</th>
                <th className="px-4 py-2 font-medium">Engagement</th>
                <th className="px-4 py-2 text-right font-medium">Rate</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {rates.map((r) => {
                const member = r.userId
                  ? members.find((m) => m.userId === r.userId)
                  : null;
                const userName = member
                  ? member.user.firstName || member.user.lastName
                    ? `${member.user.firstName ?? ""} ${member.user.lastName ?? ""}`.trim()
                    : member.user.email
                  : "Any";
                return (
                  <tr
                    key={r.id}
                    className="border-t border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-4 py-2 text-xs">
                      {r.isDefault ? (
                        <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-800">
                          Default
                        </span>
                      ) : r.userId && r.engagementId ? (
                        <span className="text-slate-700">User + Engagement</span>
                      ) : r.userId ? (
                        <span className="text-slate-700">By user</span>
                      ) : r.engagementId ? (
                        <span className="text-slate-700">By engagement</span>
                      ) : (
                        <span className="text-slate-500">Tenant</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-700">{userName}</td>
                    <td className="px-4 py-2 text-slate-700">
                      {r.engagement
                        ? `${r.engagement.entity.name} · ${r.engagement.name}`
                        : "Any"}
                    </td>
                    <td className="px-4 py-2 text-right font-mono">
                      {fmtMoney(r.rateCents)}/h
                    </td>
                    <td className="px-4 py-2 text-right">
                      <form action={deleteBillingRateAction} className="inline">
                        <input
                          type="hidden"
                          name="tenantSlug"
                          value={params.tenant}
                        />
                        <input type="hidden" name="id" value={r.id} />
                        <button
                          type="submit"
                          className="text-xs text-rose-600 hover:underline"
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
  );
}
