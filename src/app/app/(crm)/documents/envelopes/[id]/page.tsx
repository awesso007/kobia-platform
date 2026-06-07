/*
 * Envelope detail (Sprint 14). Shows the wrapped document, signer roster with
 * status, the audit trail, and Send/Void actions.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { getEnvelope } from "../../queries";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../../CrmError";
import { Card, DocBadge } from "../../DocumentsUI";
import { fmtDateTime } from "../../documents-utils";
import { EnvelopeActions } from "./EnvelopeActions";

export const dynamic = "force-dynamic";

export default async function EnvelopeDetailPage({ params }: { params: { id: string } }) {
  try {
    const env = await getEnvelope(params.id);
    if (!env) notFound();
    return (
      <div className="p-6">
        <Link href="/app/documents/envelopes" className="mb-4 inline-block text-sm hover:underline" style={{ color: "var(--kb-primary)" }}>
          Back to Signatures
        </Link>
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold" style={{ color: "var(--kb-text-primary)" }}>
                {env.name}
              </h1>
              <DocBadge value={env.status} />
            </div>
            <p className="mt-1 text-sm" style={{ color: "var(--kb-text-secondary)" }}>
              Document:{" "}
              {env.document ? (
                <Link href={`/app/documents/${env.document.id}`} className="hover:underline" style={{ color: "var(--kb-primary)" }}>
                  {env.document.name}
                </Link>
              ) : (
                "(deleted)"
              )}
            </p>
          </div>
          <EnvelopeActions id={env.id} status={env.status} />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <div className="mb-2 text-xs font-medium uppercase" style={{ color: "var(--kb-text-secondary)" }}>
              Signers
            </div>
            <ul className="space-y-2 text-sm">
              {env.signers.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2">
                  <span style={{ color: "var(--kb-text-primary)" }}>
                    {s.order + 1}. {s.name} ({s.email})
                  </span>
                  <DocBadge value={s.status} />
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-4">
            <div className="mb-2 text-xs font-medium uppercase" style={{ color: "var(--kb-text-secondary)" }}>
              Audit trail
            </div>
            {env.auditEvents.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>
                No events yet.
              </p>
            ) : (
              <ul className="space-y-1 text-sm">
                {env.auditEvents.map((a) => (
                  <li key={a.id} className="flex justify-between gap-2" style={{ color: "var(--kb-text-primary)" }}>
                    <span>{a.event}</span>
                    <span style={{ color: "var(--kb-text-secondary)" }}>{fmtDateTime(a.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
