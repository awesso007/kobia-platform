import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  logCommunication,
  deleteCommunication,
} from "@/app/actions/comms-actions";

export const dynamic = "force-dynamic";

const CHANNELS = ["EMAIL", "SMS", "PORTAL", "PHONE", "MEETING", "OTHER"] as const;
const CHANNEL_LABEL: Record<string, string> = {
  EMAIL: "Email",
  SMS: "SMS",
  PORTAL: "Portal",
  PHONE: "Phone",
  MEETING: "Meeting",
  OTHER: "Other",
};
const CHANNEL_TINT: Record<string, string> = {
  EMAIL: "bg-sky-50 text-sky-700",
  SMS: "bg-emerald-50 text-emerald-700",
  PORTAL: "bg-violet-50 text-violet-700",
  PHONE: "bg-amber-50 text-amber-700",
  MEETING: "bg-indigo-50 text-indigo-700",
  OTHER: "bg-slate-100 text-slate-600",
};

export default async function CommunicationsPage({
  params,
  searchParams,
}: {
  params: { tenant: string };
  searchParams?: { customerId?: string; channel?: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);
  const { tenant } = auth;

  const [customers, entities, comms] = await Promise.all([
    db.customer
      .findMany({ where: { tenantId: tenant.id }, orderBy: { name: "asc" }, take: 200 })
      .catch(() => []),
    db.entity
      .findMany({ where: { tenantId: tenant.id }, orderBy: { name: "asc" }, take: 100 })
      .catch(() => []),
    db.customerCommunication
      .findMany({
        where: {
          tenantId: tenant.id,
          ...(searchParams?.customerId
            ? { customerId: searchParams.customerId }
            : {}),
          ...(searchParams?.channel
            ? { channel: searchParams.channel as (typeof CHANNELS)[number] }
            : {}),
        },
        orderBy: { sentAt: "desc" },
        take: 300,
      })
      .catch(() => []),
  ]);

  const custMap = new Map(customers.map((c) => [c.id, c.name]));
  const entMap = new Map(entities.map((e) => [e.id, e.name]));

  type Comm = (typeof comms)[number];
  const grouped = new Map<string, Comm[]>();
  for (const c of comms) {
    const day = new Date(c.sentAt).toDateString();
    const existing = grouped.get(day);
    if (existing) {
      existing.push(c);
    } else {
      grouped.set(day, [c]);
    }
  }

  return (
    <div className="px-6 py-6">
      <h1 className="text-2xl font-semibold text-slate-900">
        Customer Communications
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Every email, statement, and message sent to your clients. Log calls and
        meetings here too.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Total messages" value={comms.length} />
        <KpiCard
          label="This week"
          value={
            comms.filter(
              (c) =>
                new Date(c.sentAt).getTime() >
                Date.now() - 7 * 86400000,
            ).length
          }
        />
        <KpiCard
          label="Customers reached"
          value={new Set(comms.map((c) => c.customerId).filter(Boolean)).size}
        />
      </div>

      <details className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
        <summary className="cursor-pointer text-sm font-semibold text-slate-900">
          Log a communication
        </summary>
        <form
          action={logCommunication.bind(null, params.tenant)}
          className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <div>
            <label className="block text-xs font-medium text-slate-600">Channel</label>
            <select
              name="channel"
              defaultValue="EMAIL"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {CHANNEL_LABEL[c]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Direction</label>
            <select
              name="direction"
              defaultValue="OUTBOUND"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="OUTBOUND">Outbound</option>
              <option value="INBOUND">Inbound</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600">Subject</label>
            <input
              name="subject"
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
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
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600">Recipient</label>
            <input
              name="recipient"
              placeholder="email, phone, or name"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600">Notes / Body</label>
            <textarea
              name="body"
              rows={3}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2 text-right">
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Log message
            </button>
          </div>
        </form>
      </details>

      <div className="mt-6">
        <form className="flex flex-wrap items-center gap-2">
          <select
            name="customerId"
            defaultValue={searchParams?.customerId ?? ""}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">All customers</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            name="channel"
            defaultValue={searchParams?.channel ?? ""}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">All channels</option>
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {CHANNEL_LABEL[c]}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
          >
            Filter
          </button>
          {(searchParams?.customerId || searchParams?.channel) && (
            <Link
              href={`/${params.tenant}/communications`}
              className="text-sm text-slate-500 hover:text-slate-700"
            >
              Clear
            </Link>
          )}
        </form>
      </div>

      <div className="mt-6">
        {comms.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
            No communications yet. Log your first message above, or messages
            sent through invoicing and statement runs will show up here
            automatically.
          </div>
        ) : (
          <div className="space-y-6">
            {Array.from(grouped.entries()).map(([day, items]) => (
              <section key={day}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {day}
                </h3>
                <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <tbody className="divide-y divide-slate-100">
                      {items.map((c) => (
                        <tr key={c.id}>
                          <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-500">
                            {new Date(c.sentAt).toLocaleTimeString([], {
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${CHANNEL_TINT[c.channel] ?? "bg-slate-100 text-slate-600"}`}
                            >
                              {CHANNEL_LABEL[c.channel] ?? c.channel}
                            </span>
                            <span className="ml-2 text-xs text-slate-500">
                              {c.direction === "OUTBOUND" ? "→ sent" : "← received"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900">
                              {c.subject}
                            </div>
                            {c.body ? (
                              <div className="text-xs text-slate-500 line-clamp-2">
                                {c.body}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600">
                            {c.customerId ? custMap.get(c.customerId) : null}
                            {c.entityId ? (
                              <span className="text-xs text-slate-500">
                                {c.customerId ? " · " : ""}
                                {entMap.get(c.entityId)}
                              </span>
                            ) : null}
                            {c.recipient ? (
                              <div className="text-xs text-slate-400">
                                {c.recipient}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <form
                              action={deleteCommunication.bind(null, params.tenant)}
                              className="inline"
                            >
                              <input type="hidden" name="id" value={c.id} />
                              <button
                                type="submit"
                                className="rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
                              >
                                Delete
                              </button>
                            </form>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
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
