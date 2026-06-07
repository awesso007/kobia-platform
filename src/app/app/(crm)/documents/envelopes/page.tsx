/*
 * Envelopes list (Sprint 14). E-signature requests with status badges and
 * signer progress. No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { listEnvelopes } from "../queries";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../CrmError";
import { PageHeader, Card, EmptyState, RowLink, DocBadge } from "../DocumentsUI";
import { fmtDate } from "../documents-utils";

export const dynamic = "force-dynamic";

export default async function EnvelopesPage() {
  try {
    const rows = await listEnvelopes();
    return (
      <div className="p-6">
        <PageHeader
          title="Signatures"
          subtitle="E-signature envelopes and their signer progress."
          action={
            <Link
              href="/app/documents/envelopes/new"
              className="inline-flex items-center rounded px-3 py-1.5 text-sm font-medium text-white"
              style={{ backgroundColor: "var(--kb-primary)", borderRadius: "var(--kb-radius-sm)" }}
            >
              New envelope
            </Link>
          }
        />
        <Card>
          {rows.length === 0 ? (
            <EmptyState message="No signature requests yet." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--kb-border)" }}>
                  <Th>Name</Th>
                  <Th>Document</Th>
                  <Th>Status</Th>
                  <Th>Signers</Th>
                  <Th>Sent</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} style={{ borderBottom: "1px solid var(--kb-border)" }}>
                    <Td>
                      <RowLink href={`/app/documents/envelopes/${e.id}`}>{e.name}</RowLink>
                    </Td>
                    <Td>{e.documentName}</Td>
                    <Td>
                      <DocBadge value={e.status} />
                    </Td>
                    <Td>
                      {e.signedCount}/{e.signerCount} signed
                    </Td>
                    <Td>{fmtDate(e.sentAt)}</Td>
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
