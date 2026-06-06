/*
 * Broadcasts list (Sprint 13). Server component lists one-off email/SMS sends.
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { listBroadcasts } from "../queries";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../CrmError";
import { PageHeader, Card, EmptyState, RowLink, MarketingBadge, fmtDate } from "../MarketingUI";

export const dynamic = "force-dynamic";

export default async function BroadcastsPage() {
  try {
    const rows = await listBroadcasts();
    return (
      <div className="p-6">
        <PageHeader
          title="Broadcasts"
          subtitle="One-off email and SMS sends to a segment."
          action={
            <Link
              href="/app/marketing/broadcasts/new"
              className="inline-flex items-center rounded px-3 py-1.5 text-sm font-medium text-white"
              style={{ backgroundColor: "var(--kb-primary)", borderRadius: "var(--kb-radius-sm)" }}
            >
              New broadcast
            </Link>
          }
        />
        <Card>
          {rows.length === 0 ? (
            <EmptyState message="No broadcasts yet." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--kb-border)" }}>
                  <Th>Name</Th>
                  <Th>Channel</Th>
                  <Th>Segment</Th>
                  <Th>Status</Th>
                  <Th>Scheduled</Th>
                  <Th>Sent</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id} style={{ borderBottom: "1px solid var(--kb-border)" }}>
                    <Td>
                      <RowLink href={`/app/marketing/broadcasts/${b.id}`}>{b.name}</RowLink>
                    </Td>
                    <Td>
                      <MarketingBadge value={b.channel} />
                    </Td>
                    <Td>{b.segmentName ?? "-"}</Td>
                    <Td>
                      <MarketingBadge value={b.status} />
                    </Td>
                    <Td>{fmtDate(b.scheduledAt)}</Td>
                    <Td>{fmtDate(b.sentAt)}</Td>
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
