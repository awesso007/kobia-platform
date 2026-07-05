/*
 * Form submissions list (Sprint 19). Server component; table of recent
 * submissions with drill-down links.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../../CrmError";
import { getForm, listSubmissions } from "@/lib/forms2/queries";
import { formatMoneyCents } from "@/lib/forms2/form-utils";
import { PageHeader, Card, EmptyState, StatusBadge, Th, Td } from "../../Forms2UI";
import { fmtDate } from "../../forms2-ui-utils";

export const dynamic = "force-dynamic";

export default async function SubmissionsPage({ params }: { params: { id: string } }) {
  try {
    const { db } = getTenantDb();
    const form = await getForm(db, params.id);
    if (!form) notFound();
    const submissions = await listSubmissions(db, params.id);
    return (
      <div className="p-6">
        <div className="mb-2 text-xs" style={{ color: "var(--kb-text-secondary)" }}>
          <Link href="/app/forms2">Forms</Link>
          {" / "}
          <Link href={`/app/forms2/${form.id}`}>{form.name}</Link>
        </div>
        <PageHeader title={`${form.name} submissions`} subtitle={`${submissions.length} recent submissions.`} />
        <Card>
          {submissions.length === 0 ? (
            <EmptyState message="No submissions yet." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--kb-border)" }}>
                  <Th>Submitted</Th>
                  <Th>Status</Th>
                  <Th>Amount</Th>
                  <Th>Preview</Th>
                  <Th>{" "}</Th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((s) => (
                  <tr key={s.id} style={{ borderBottom: "1px solid var(--kb-border)" }}>
                    <Td>{fmtDate(s.createdAt)}</Td>
                    <Td>
                      <StatusBadge status={s.status} />
                    </Td>
                    <Td>{s.amountCents === null ? "-" : formatMoneyCents(s.amountCents, s.currency)}</Td>
                    <Td>
                      <span className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>
                        {Object.entries(s.data)
                          .slice(0, 3)
                          .map(([k, v]) => `${k}: ${String(v)}`)
                          .join(", ")}
                      </span>
                    </Td>
                    <Td>
                      <Link href={`/app/forms2/${form.id}/submissions/${s.id}`} style={{ color: "var(--kb-primary)" }}>
                        View
                      </Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
