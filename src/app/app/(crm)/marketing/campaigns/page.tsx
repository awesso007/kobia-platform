/*
 * Campaigns list (Sprint 13). Server component lists drip campaigns.
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { listCampaigns } from "../queries";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../CrmError";
import { PageHeader, Card, EmptyState, RowLink, MarketingBadge } from "../MarketingUI";
import { fmtDate } from "../marketing-utils";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  try {
    const rows = await listCampaigns();
    return (
      <div className="p-6">
        <PageHeader
          title="Campaigns"
          subtitle="Multi-step drip sequences over a segment."
          action={
            <Link
              href="/app/marketing/campaigns/new"
              className="inline-flex items-center rounded px-3 py-1.5 text-sm font-medium text-white"
              style={{ backgroundColor: "var(--kb-primary)", borderRadius: "var(--kb-radius-sm)" }}
            >
              New campaign
            </Link>
          }
        />
        <Card>
          {rows.length === 0 ? (
            <EmptyState message="No campaigns yet." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--kb-border)" }}>
                  <Th>Name</Th>
                  <Th>Status</Th>
                  <Th>Trigger</Th>
                  <Th>Steps</Th>
                  <Th>Active enrollments</Th>
                  <Th>Updated</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} style={{ borderBottom: "1px solid var(--kb-border)" }}>
                    <Td>
                      <RowLink href={`/app/marketing/campaigns/${c.id}`}>{c.name}</RowLink>
                    </Td>
                    <Td>
                      <MarketingBadge value={c.status} />
                    </Td>
                    <Td>{c.triggerType}</Td>
                    <Td>{c.stepCount}</Td>
                    <Td>{c.activeEnrollments}</Td>
                    <Td>{fmtDate(c.updatedAt)}</Td>
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
