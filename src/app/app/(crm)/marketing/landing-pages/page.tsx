/*
 * Landing pages list (Sprint 13). Server component lists pages; published ones
 * are served publicly at /p/<slug>.
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { listLandingPages } from "../queries";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../CrmError";
import { PageHeader, Card, EmptyState, RowLink, MarketingBadge, fmtDate } from "../MarketingUI";

export const dynamic = "force-dynamic";

export default async function LandingPagesPage() {
  try {
    const rows = await listLandingPages();
    return (
      <div className="p-6">
        <PageHeader
          title="Landing pages"
          subtitle="Published pages are served at /p/<slug>."
          action={
            <Link
              href="/app/marketing/landing-pages/new"
              className="inline-flex items-center rounded px-3 py-1.5 text-sm font-medium text-white"
              style={{ backgroundColor: "var(--kb-primary)", borderRadius: "var(--kb-radius-sm)" }}
            >
              New page
            </Link>
          }
        />
        <Card>
          {rows.length === 0 ? (
            <EmptyState message="No landing pages yet." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--kb-border)" }}>
                  <Th>Title</Th>
                  <Th>Slug</Th>
                  <Th>Status</Th>
                  <Th>Views</Th>
                  <Th>Conversions</Th>
                  <Th>Published</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} style={{ borderBottom: "1px solid var(--kb-border)" }}>
                    <Td>
                      <RowLink href={`/app/marketing/landing-pages/${p.id}`}>{p.title}</RowLink>
                    </Td>
                    <Td>
                      <code className="text-xs">/p/{p.slug}</code>
                    </Td>
                    <Td>
                      <MarketingBadge value={p.status} />
                    </Td>
                    <Td>{p.viewCount}</Td>
                    <Td>{p.conversionCount}</Td>
                    <Td>{fmtDate(p.publishedAt)}</Td>
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
