import Link from "next/link";
import { redirect } from "next/navigation";
import type { PracticeTimeStatus } from "@prisma/client";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  createManualEntryAction,
  deleteEntryAction,
  setEntryStatusAction,
  startTimerAction,
  stopTimerAction,
} from "@/app/actions/time-actions";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  RUNNING: "bg-amber-100 text-amber-800",
  LOGGED: "bg-slate-100 text-slate-700",
  APPROVED: "bg-sky-100 text-sky-800",
  BILLED: "bg-emerald-100 text-emerald-800",
  WRITTEN_OFF: "bg-rose-100 text-rose-800",
};

function fmtMoney(cents: bigint | number): string {
  const n = typeof cents === "bigint" ? Number(cents) / 100 : cents / 100;
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function fmtDateTime(d: Date): string {
  return new Date(d).toLocaleString();
}

function fmtMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function calcValueCents(minutes: number, rateCents: bigint): bigint {
  return BigInt(Math.round((minutes / 60) * Number(rateCents)));
}

function nowLocalISO(): string {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

export default async function TimePage({
  params,
  searchParams,
}: {
  params: { tenant: string };
  searchParams?: { status?: string; engagementId?: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const statusFilter = searchParams?.status ?? "ALL";
  const engagementFilter = searchParams?.engagementId ?? "ALL";

  const where = {
    tenantId: auth.tenant.id,
    ...(statusFilter !== "ALL"
      ? { status: statusFilter as PracticeTimeStatus }
      : {}),
    ...(engagementFilter !== "ALL"
      ? { engagementId: engagementFilter }
      : {}),
  };

  const [entries, engagements, runningTimer, counts] = await Promise.all([
    db.practiceTimeEntry.findMany({
      where,
      orderBy: { startedAt: "desc" },
      take: 200,
      include: {
        engagement: {
          select: { id: true, name: true, entity: { select: { name: true } } },
        },
      },
    }),
    db.engagement.findMany({
      where: { tenantId: auth.tenant.id, status: { not: "CANCELLED" } },
      orderBy: { name: "asc" },
      include: { entity: { select: { name: true } } },
    }),
    db.practiceTimeEntry.findFirst({
      where: {
        tenantId: auth.tenant.id,
        userId: auth.user.id,
        status: "RUNNING",
      },
      include: {
        engagement: { select: { id: true, name: true } },
      },
    }),
    db.practiceTimeEntry.groupBy({
      by: ["status"],
      where: { tenantId: auth.tenant.id },
      _count: { _all: true },
    }),
  ]);

  const total = counts.reduce((s, c) => s + c._count._all, 0);
  const byStatus = new Map(counts.map((c) => [c.status, c._count._all]));

  const filterTabs: { value: string; label: string; count: number }[] = [
    { value: "ALL", label: "All", count: total },
    { value: "LOGGED", label: "Logged", count: byStatus.get("LOGGED") ?? 0 },
    {
      value: "APPROVED",
      label: "Approved",
      count: byStatus.get("APPROVED") ?? 0,
    },
    { value: "BILLED", label: "Billed", count: byStatus.get("BILLED") ?? 0 },
    {
      value: "WRITTEN_OFF",
      label: "Written off",
      count: byStatus.get("WRITTEN_OFF") ?? 0,
    },
  ];

  // Totals for the current filter
  const totalMinutes = entries.reduce((s, e) => s + e.durationMinutes, 0);
  const billableMinutes = entries.reduce(
    (s, e) => s + e.billableMinutes,
    0
  );
  const billableValueCents = entries.reduce(
    (s, e) => s + Number(calcValueCents(e.billableMinutes, e.rateCents)),
    0
  );

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Time</h1>
          <p className="mt-1 text-sm text-slate-500">
            Track billable time on engagements. Start a timer or log manually.
          </p>
        </div>
        <Link
          href={`/${params.tenant}/time/rates`}
          className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          Billing rates →
        </Link>
      </div>

      {/* Active timer banner */}
      {runningTimer ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-amber-700">
              Timer running
            </div>
            <div className="mt-0.5 text-sm font-semibold text-slate-900">
              {runningTimer.description}
            </div>
            <div className="text-xs text-slate-600">
              {runningTimer.engagement.name} · started{" "}
              {fmtDateTime(runningTimer.startedAt)}
            </div>
          </div>
          <form action={stopTimerAction}>
            <input type="hidden" name="tenantSlug" value={params.tenant} />
            <input type="hidden" name="id" value={runningTimer.id} />
            <button
              type="submit"
              className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
            >
              Stop timer
            </button>
          </form>
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">
            Start a timer
          </h2>
          {engagements.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">
              You need at least one engagement to track time.{" "}
              <Link
                href={`/${params.tenant}/practice`}
                className="text-slate-700 underline"
              >
                Create one →
              </Link>
            </p>
          ) : (
            <form
              action={startTimerAction}
              className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3"
            >
              <input type="hidden" name="tenantSlug" value={params.tenant} />
              <div>
                <label className="block text-xs text-slate-600">
                  Engagement
                </label>
                <select
                  required
                  name="engagementId"
                  className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                  defaultValue=""
                >
                  <option value="" disabled>
                    Choose…
                  </option>
                  {engagements.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.entity.name} · {e.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2 flex gap-2">
                <input
                  name="description"
                  type="text"
                  placeholder="What are you working on?"
                  className="flex-1 rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                />
                <button
                  type="submit"
                  className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  Start
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Manual entry */}
      <details className="mt-4 rounded-lg border border-slate-200 bg-white">
        <summary className="cursor-pointer p-4 text-sm font-semibold text-slate-900">
          Log time manually
        </summary>
        <form
          action={createManualEntryAction}
          className="grid grid-cols-1 gap-3 border-t border-slate-100 p-4 md:grid-cols-3"
        >
          <input type="hidden" name="tenantSlug" value={params.tenant} />
          <div>
            <label className="block text-xs text-slate-600">Engagement</label>
            <select
              required
              name="engagementId"
              defaultValue=""
              className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            >
              <option value="" disabled>
                Choose…
              </option>
              {engagements.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.entity.name} · {e.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-600">Started at</label>
            <input
              name="startedAt"
              type="datetime-local"
              defaultValue={nowLocalISO()}
              className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex items-end gap-2">
            <div>
              <label className="block text-xs text-slate-600">Hours</label>
              <input
                name="hours"
                type="number"
                min={0}
                step={1}
                defaultValue={0}
                className="mt-1 w-20 rounded-md border border-slate-200 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-600">Minutes</label>
              <input
                name="minutes"
                type="number"
                min={0}
                max={59}
                step={1}
                defaultValue={0}
                className="mt-1 w-20 rounded-md border border-slate-200 px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-slate-600">Description</label>
            <input
              required
              name="description"
              type="text"
              className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                name="isBillable"
                defaultChecked
                className="rounded border-slate-300"
              />
              Billable
            </label>
          </div>
          <div className="md:col-span-3 flex justify-end">
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Save entry
            </button>
          </div>
        </form>
      </details>

      {/* Summary strip */}
      <div className="mt-6 grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Hours (filter)
          </div>
          <div className="mt-1 text-xl font-semibold text-slate-900">
            {fmtMinutes(totalMinutes)}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Billable
          </div>
          <div className="mt-1 text-xl font-semibold text-slate-900">
            {fmtMinutes(billableMinutes)}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Value
          </div>
          <div className="mt-1 text-xl font-semibold text-emerald-700">
            {fmtMoney(billableValueCents)}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2 text-xs">
          {filterTabs.map((t) => {
            const active = statusFilter === t.value;
            const qs = new URLSearchParams();
            qs.set("status", t.value);
            if (engagementFilter !== "ALL") {
              qs.set("engagementId", engagementFilter);
            }
            return (
              <Link
                key={t.value}
                href={`/${params.tenant}/time?${qs.toString()}`}
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
        <form className="ml-auto flex items-center gap-2 text-xs">
          <input
            type="hidden"
            name="status"
            value={statusFilter === "ALL" ? "" : statusFilter}
          />
          <label className="text-slate-500">Engagement</label>
          <select
            name="engagementId"
            defaultValue={engagementFilter}
            className="rounded-md border border-slate-200 px-2 py-1 text-xs"
          >
            <option value="ALL">All</option>
            {engagements.map((e) => (
              <option key={e.id} value={e.id}>
                {e.entity.name} · {e.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-50"
          >
            Filter
          </button>
        </form>
      </div>

      {/* Entries table */}
      {entries.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
          No time entries yet. Start a timer or log manually.
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Engagement</th>
                <th className="px-3 py-2 font-medium">Description</th>
                <th className="px-3 py-2 text-right font-medium">Hours</th>
                <th className="px-3 py-2 text-right font-medium">Rate</th>
                <th className="px-3 py-2 text-right font-medium">Value</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const value = calcValueCents(e.billableMinutes, e.rateCents);
                const canActOnStatus =
                  ["OWNER", "ADMIN"].includes(auth.role) &&
                  e.status !== "RUNNING" &&
                  e.status !== "BILLED";
                return (
                  <tr
                    key={e.id}
                    className="border-t border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-3 py-2 text-xs text-slate-600">
                      {new Date(e.startedAt).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-slate-900">
                        {e.engagement.entity.name}
                      </div>
                      <div className="text-xs text-slate-500">
                        {e.engagement.name}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {e.description}
                      {!e.isBillable && (
                        <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase text-slate-500">
                          Non-billable
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-slate-700">
                      {fmtMinutes(e.durationMinutes)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-slate-600">
                      {fmtMoney(e.rateCents)}/h
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-slate-900">
                      {fmtMoney(value)}
                    </td>
                    <td className="px-3 py-2">
                      {canActOnStatus ? (
                        <form
                          action={setEntryStatusAction}
                          className="inline-flex items-center gap-1"
                        >
                          <input
                            type="hidden"
                            name="tenantSlug"
                            value={params.tenant}
                          />
                          <input type="hidden" name="id" value={e.id} />
                          <select
                            name="status"
                            defaultValue={e.status}
                            className={`rounded px-1.5 py-0.5 text-xs ${
                              STATUS_BADGE[e.status] ?? "bg-slate-100"
                            }`}
                          >
                            <option value="LOGGED">LOGGED</option>
                            <option value="APPROVED">APPROVED</option>
                            <option value="WRITTEN_OFF">WRITTEN_OFF</option>
                          </select>
                          <button
                            type="submit"
                            className="text-xs text-slate-600 hover:underline"
                          >
                            Set
                          </button>
                        </form>
                      ) : (
                        <span
                          className={`inline-flex rounded px-2 py-0.5 text-xs ${
                            STATUS_BADGE[e.status] ?? "bg-slate-100"
                          }`}
                        >
                          {e.status}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {e.status !== "BILLED" && e.status !== "RUNNING" && (
                        <form action={deleteEntryAction} className="inline">
                          <input
                            type="hidden"
                            name="tenantSlug"
                            value={params.tenant}
                          />
                          <input type="hidden" name="id" value={e.id} />
                          <button
                            type="submit"
                            className="text-xs text-rose-600 hover:underline"
                          >
                            Delete
                          </button>
                        </form>
                      )}
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
