/*
 * Sites list (Sprint 17). Server component lists the tenant's sites; published
 * sites are served at /s/<slug>. Distinct from Marketing landing pages (/p/...).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../CrmError";
import { sitesForTenant } from "./queries";
import { PageHeader, Card, EmptyState, RowLink, StatusBadge, Th, Td } from "./SitesUI";
import { fmtDate } from "@/lib/sites/site-utils";

export const dynamic = "force-dynamic";

export default async function SitesPage() {
  try {
    const sites = await sitesForTenant();
    return (
      <div className="p-6">
        <PageHeader
          title="Sites"
          subtitle="Build multi-page sites. Published sites are served at /s/<slug>."
          action={
            <Link
              href="/app/sites/new"
              className="inline-flex items-center rounded px-3 py-1.5 text-sm font-medium text-white"
              style={{ backgroundColor: "var(--kb-primary)", borderRadius: "var(--kb-radius-sm)" }}
            >
              New site
            </Link>
          }
        />
        <Card>
          {sites.length === 0 ? (
            <EmptyState message="No sites yet." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--kb-border)" }}>
                  <Th>Name</Th>
                  <Th>Slug</Th>
                  <Th>Pages</Th>
                  <Th>Status</Th>
                  <Th>Updated</Th>
                </tr>
              </thead>
              <tbody>
                {sites.map((s) => (
                  <tr key={s.id} style={{ borderBottom: "1px solid var(--kb-border)" }}>
                    <Td>
                      <RowLink href={`/app/sites/${s.id}`}>{s.name}</RowLink>
                    </Td>
                    <Td>
                      <code className="text-xs">/s/{s.slug}</code>
                    </Td>
                    <Td>{s.pageCount}</Td>
                    <Td>
                      <StatusBadge published={s.published} />
                    </Td>
                    <Td>{fmtDate(s.updatedAt)}</Td>
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
