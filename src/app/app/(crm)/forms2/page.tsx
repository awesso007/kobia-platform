/*
 * Forms 2.0 list page (Sprint 19). Server component; lists FormV2 records for
 * the active tenant with status and counts.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../CrmError";
import { listForms } from "@/lib/forms2/queries";
import { PageHeader, Card, EmptyState, StatusBadge, Th, Td } from "./Forms2UI";
import { fmtDate } from "./forms2-ui-utils";

export const dynamic = "force-dynamic";

export default async function Forms2Page() {
  try {
    const { db } = getTenantDb();
    const forms = await listForms(db);
    return (
      <div className="p-6">
        <PageHeader
          title="Forms"
          subtitle="Multi-step forms with visibility rules, calculations, and payments."
          action={
            <Link
              href="/app/forms2/new"
              className="inline-flex items-center rounded px-3 py-1.5 text-sm font-medium text-white"
              style={{ backgroundColor: "var(--kb-primary)", borderRadius: "var(--kb-radius-sm)" }}
            >
              New form
            </Link>
          }
        />
        <Card>
          {forms.length === 0 ? (
            <EmptyState message="No forms yet." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--kb-border)" }}>
                  <Th>Name</Th>
                  <Th>Slug</Th>
                  <Th>Status</Th>
                  <Th>Steps</Th>
                  <Th>Fields</Th>
                  <Th>Submissions</Th>
                  <Th>Updated</Th>
                </tr>
              </thead>
              <tbody>
                {forms.map((f) => (
                  <tr key={f.id} style={{ borderBottom: "1px solid var(--kb-border)" }}>
                    <Td>
                      <Link href={`/app/forms2/${f.id}`} style={{ color: "var(--kb-primary)" }}>
                        {f.name}
                      </Link>
                    </Td>
                    <Td>
                      <code className="text-xs">{f.slug}</code>
                    </Td>
                    <Td>
                      <StatusBadge status={f.status} />
                    </Td>
                    <Td>{f.stepCount}</Td>
                    <Td>{f.fieldCount}</Td>
                    <Td>
                      <Link href={`/app/forms2/${f.id}/submissions`} style={{ color: "var(--kb-primary)" }}>
                        {f.submissionCount}
                      </Link>
                    </Td>
                    <Td>{fmtDate(f.updatedAt)}</Td>
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
