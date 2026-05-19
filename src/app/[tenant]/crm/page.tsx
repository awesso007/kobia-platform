import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { seedDefaultPipelineAction } from "@/app/actions/crm-actions";

export const dynamic = "force-dynamic";

function fmtMoney(cents: bigint | number): string {
  const n = typeof cents === "bigint" ? Number(cents) / 100 : cents / 100;
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

const STAGE_TINT: Record<string, string> = {
  Qualified: "border-t-slate-400",
  "Proposal Sent": "border-t-sky-500",
  Negotiation: "border-t-amber-500",
  "Closed Won": "border-t-emerald-500",
  "Closed Lost": "border-t-rose-500",
};

export default async function CrmPipelinePage({
  params,
}: {
  params: { tenant: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const pipeline = await db.pipeline.findFirst({
    where: { tenantId: auth.tenant.id, isDefault: true },
    include: {
      stages: {
        orderBy: { sortOrder: "asc" },
        include: {
          deals: {
            where: { status: { not: undefined } },
            orderBy: { createdAt: "desc" },
            take: 50,
          },
        },
      },
    },
  });

  if (!pipeline) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-bold text-slate-900">CRM pipeline</h1>
        <p className="mt-2 text-sm text-slate-500">
          Get started by seeding the default sales pipeline. It comes with five
          stages: Qualified, Proposal Sent, Negotiation, Closed Won, and Closed
          Lost.
        </p>
        <form action={seedDefaultPipelineAction} className="mt-4">
          <input type="hidden" name="tenantSlug" value={params.tenant} />
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Seed default pipeline
          </button>
        </form>
      </div>
    );
  }

  const totalsByStage = pipeline.stages.map((s) => ({
    id: s.id,
    name: s.name,
    count: s.deals.length,
    total: s.deals.reduce((sum, d) => sum + Number(d.amountCents), 0),
  }));

  const grandOpen = pipeline.stages
    .filter((s) => !s.isWon && !s.isLost)
    .reduce(
      (sum, s) => sum + s.deals.reduce((t, d) => t + Number(d.amountCents), 0),
      0
    );

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">CRM pipeline</h1>
          <p className="mt-1 text-sm text-slate-500">
            {pipeline.name} · Open pipeline value{" "}
            <span className="font-medium text-slate-800">
              {fmtMoney(grandOpen)}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/${params.tenant}/crm/leads`}
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Leads →
          </Link>
        </div>
      </div>

      <div className="mt-6 grid auto-cols-[18rem] grid-flow-col gap-3 overflow-x-auto pb-3">
        {pipeline.stages.map((stage) => {
          const totals = totalsByStage.find((t) => t.id === stage.id)!;
          return (
            <div
              key={stage.id}
              className={`flex min-h-[60vh] flex-col rounded-lg border border-slate-200 border-t-4 bg-slate-50 ${
                STAGE_TINT[stage.name] ?? "border-t-slate-300"
              }`}
            >
              <div className="border-b border-slate-200 bg-white px-3 py-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-900">
                    {stage.name}
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {totals.count}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {fmtMoney(totals.total)}
                </div>
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto p-2">
                {stage.deals.length === 0 ? (
                  <div className="rounded-md border border-dashed border-slate-200 bg-white p-3 text-center text-xs text-slate-400">
                    No deals
                  </div>
                ) : (
                  stage.deals.map((d) => (
                    <Link
                      key={d.id}
                      href={`/${params.tenant}/crm/deals/${d.id}`}
                      className="block rounded-md border border-slate-200 bg-white p-3 text-xs shadow-sm hover:border-slate-300 hover:shadow"
                    >
                      <div className="font-medium text-slate-900">
                        {d.name}
                      </div>
                      <div className="mt-1 flex items-center justify-between text-slate-600">
                        <span>{fmtMoney(d.amountCents)}</span>
                        <span className="text-slate-400">
                          {d.closeDate ? fmtDate(d.closeDate) : ""}
                        </span>
                      </div>
                      {d.probabilityPct != null && (
                        <div className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">
                          {d.probabilityPct}% likely
                        </div>
                      )}
                    </Link>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
