/*
 * Segments list (Sprint 13). Server component lists all segments; the New
 * button and per-row links go to the segment builder.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { listSegments } from "../queries";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../CrmError";
import { PageHeader, Card, EmptyState, RowLink } from "../MarketingUI";
import { fmtDate } from "../marketing-utils";

export const dynamic = "force-dynamic";

export default async function SegmentsPage() {
  try {
    const rows = await listSegments();
    return (
      <div className="p-6">
        <PageHeader
          title="Segments"
          subtitle="Dynamic audiences over contacts or leads."
          action={
            <Link
              href="/app/marketing/segments/new"
              className="inline-flex items-center rounded px-3 py-1.5 text-sm font-medium text-white"
              style={{ backgroundColor: "var(--kb-primary)", borderRadius: "var(--kb-radius-sm)" }}
            >
              New segment
            </Link>
          }
        />
        <Card>
          {rows.length === 0 ? (
            <EmptyState message="No segments yet. Create one to target broadcasts and campaigns." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--kb-border)" }}>
                  <Th>Name</Th>
                  <Th>Type</Th>
                  <Th>Recipients</Th>
                  <Th>Last evaluated</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} style={{ borderBottom: "1px solid var(--kb-border)" }}>
                    <Td>
                      <RowLink href={`/app/marketing/segments/${s.id}`}>{s.name}</RowLink>
                      {s.description ? (
                        <div className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>
                          {s.description}
                        </div>
                      ) : null}
                    </Td>
                    <Td>{s.entityType === "lead" ? "Leads" : "Contacts"}</Td>
                    <Td>{s.recipientCountCache}</Td>
                    <Td>{fmtDate(s.lastEvaluatedAt)}</Td>
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

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2 text-left text-xs font-medium" style={{ color: "var(--kb-text-secondary)" }}>
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-4 py-3" style={{ color: "var(--kb-text-primary)" }}>
      {children}
    </td>
  );
}
