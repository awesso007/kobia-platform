/*
 * Single submission detail (Sprint 19). Server component; shows every answer
 * plus payment and lead linkage.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../../../CrmError";
import { getForm, getSubmission } from "@/lib/forms2/queries";
import { formatMoneyCents } from "@/lib/forms2/form-utils";
import { PageHeader, Card, StatusBadge } from "../../../Forms2UI";
import { fmtDate } from "../../../forms2-ui-utils";

export const dynamic = "force-dynamic";

export default async function SubmissionDetailPage({ params }: { params: { id: string; sid: string } }) {
  try {
    const { db } = getTenantDb();
    const form = await getForm(db, params.id);
    if (!form) notFound();
    const submission = await getSubmission(db, params.id, params.sid);
    if (!submission) notFound();

    const data = (submission.data ?? {}) as Record<string, unknown>;
    const labelFor = (key: string) => form.fields.find((f) => f.key === key)?.label ?? key;

    return (
      <div className="p-6">
        <div className="mb-2 text-xs" style={{ color: "var(--kb-text-secondary)" }}>
          <Link href="/app/forms2">Forms</Link>
          {" / "}
          <Link href={`/app/forms2/${form.id}`}>{form.name}</Link>
          {" / "}
          <Link href={`/app/forms2/${form.id}/submissions`}>Submissions</Link>
        </div>
        <PageHeader title="Submission" subtitle={fmtDate(submission.createdAt)} action={<StatusBadge status={submission.status} />} />
        <div style={{ maxWidth: "640px" }}>
          <Card>
            <div className="space-y-3 p-4">
              {Object.keys(data).length === 0 ? (
                <p className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>
                  No data captured.
                </p>
              ) : (
                Object.entries(data).map(([k, v]) => (
                  <div key={k} className="border-b pb-2" style={{ borderColor: "var(--kb-border)" }}>
                    <div className="text-xs font-medium uppercase" style={{ color: "var(--kb-text-secondary)" }}>
                      {labelFor(k)}
                    </div>
                    <div className="text-sm" style={{ color: "var(--kb-text-primary)" }}>
                      {Array.isArray(v) ? v.map(String).join(", ") : String(v)}
                    </div>
                  </div>
                ))
              )}
              <div className="grid grid-cols-2 gap-3 pt-1 text-sm" style={{ color: "var(--kb-text-primary)" }}>
                <div>
                  <span style={{ color: "var(--kb-text-secondary)" }}>Amount: </span>
                  {submission.amountCents === null ? "-" : formatMoneyCents(submission.amountCents, submission.currency)}
                </div>
                <div>
                  <span style={{ color: "var(--kb-text-secondary)" }}>Paid at: </span>
                  {fmtDate(submission.paidAt)}
                </div>
                <div>
                  <span style={{ color: "var(--kb-text-secondary)" }}>Lead: </span>
                  {submission.leadId ? (
                    <Link href={`/app/leads/${submission.leadId}`} style={{ color: "var(--kb-primary)" }}>
                      {submission.leadId}
                    </Link>
                  ) : (
                    "-"
                  )}
                </div>
                <div>
                  <span style={{ color: "var(--kb-text-secondary)" }}>Payment intent: </span>
                  {submission.paymentIntentId ?? "-"}
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
