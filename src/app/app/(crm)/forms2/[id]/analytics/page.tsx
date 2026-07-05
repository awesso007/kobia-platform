/*
 * Form analytics (Sprint 19). Server component; view/submit funnel and per-step
 * advance counts to spot drop-off.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../../CrmError";
import { getForm, getFormAnalytics } from "@/lib/forms2/queries";
import { PageHeader, Card } from "../../Forms2UI";

export const dynamic = "force-dynamic";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded p-4" style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)" }}>
      <div className="text-xs uppercase" style={{ color: "var(--kb-text-secondary)" }}>
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold" style={{ color: "var(--kb-text-primary)" }}>
        {value}
      </div>
    </div>
  );
}

export default async function AnalyticsPage({ params }: { params: { id: string } }) {
  try {
    const { db } = getTenantDb();
    const form = await getForm(db, params.id);
    if (!form) notFound();
    const a = await getFormAnalytics(db, params.id);
    const maxAdvance = Math.max(1, ...a.stepFunnel.map((s) => s.advances));

    return (
      <div className="p-6">
        <div className="mb-2 text-xs" style={{ color: "var(--kb-text-secondary)" }}>
          <Link href="/app/forms2">Forms</Link>
          {" / "}
          <Link href={`/app/forms2/${form.id}`}>{form.name}</Link>
        </div>
        <PageHeader title={`${form.name} analytics`} subtitle="View to submit funnel and per-step advances." />
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Views" value={String(a.views)} />
          <Stat label="Submit attempts" value={String(a.submitAttempts)} />
          <Stat label="Submitted" value={String(a.submitSuccess)} />
          <Stat label="Payments" value={String(a.paymentSuccess)} />
          <Stat label="Conversion" value={`${Math.round(a.conversionRate * 100)}%`} />
        </div>
        <Card>
          <div className="p-4">
            <div className="mb-3 text-sm font-medium" style={{ color: "var(--kb-text-primary)" }}>
              Step advances
            </div>
            {a.stepFunnel.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>
                No steps.
              </p>
            ) : (
              <div className="space-y-2">
                {a.stepFunnel.map((s) => (
                  <div key={s.stepId ?? "none"} className="flex items-center gap-3">
                    <div className="w-40 truncate text-sm" style={{ color: "var(--kb-text-primary)" }}>
                      {s.title || `Step ${s.order + 1}`}
                    </div>
                    <div className="flex-1">
                      <div
                        className="h-5 rounded"
                        style={{ width: `${Math.round((s.advances / maxAdvance) * 100)}%`, minWidth: "2px", backgroundColor: "var(--kb-primary)" }}
                      />
                    </div>
                    <div className="w-10 text-right text-sm" style={{ color: "var(--kb-text-secondary)" }}>
                      {s.advances}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
