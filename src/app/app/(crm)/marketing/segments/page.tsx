import Link from "next/link";
import { listSegments } from "../queries";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../CrmError";
import { PageHeader, Card, EmptyState, RowLink, fmtDate } from "../MarketingUI";

export const dynamic = "force-dynamic";

export default async function SegmentsPage() {
  let captured: string | null = null;
  let rows: Awaited<ReturnType<typeof listSegments>> = [];
  try {
    rows = await listSegments();
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    const e = err as Error;
    captured = `Q-ERR: ${e.name}: ${e.message}\n${e.stack}`;
  }
  
  // Render with try/catch around JSX
  try {
    if (captured) throw new Error(captured);
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
            <EmptyState message="No segments yet." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--kb-border)" }}>
                  <th className="px-4 py-2 text-left text-xs">Name</th>
                  <th className="px-4 py-2 text-left text-xs">Type</th>
                  <th className="px-4 py-2 text-left text-xs">Recipients</th>
                  <th className="px-4 py-2 text-left text-xs">Last evaluated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} style={{ borderBottom: "1px solid var(--kb-border)" }}>
                    <td className="px-4 py-3">
                      <RowLink href={`/app/marketing/segments/${s.id}`}>{s.name}</RowLink>
                    </td>
                    <td className="px-4 py-3">{s.entityType === "lead" ? "Leads" : "Contacts"}</td>
                    <td className="px-4 py-3">{s.recipientCountCache}</td>
                    <td className="px-4 py-3">{fmtDate(s.lastEvaluatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    );
  } catch (err) {
    const e = err as Error;
    return (
      <div className="p-6">
        <h1>JSX render error</h1>
        <pre className="whitespace-pre-wrap text-xs">{e.message}\n{e.stack}</pre>
      </div>
    );
  }
}
