/*
 * Document detail (Sprint 14). Loads the document with versions, share links,
 * permissions, and envelopes and hands it to the client detail surface.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDocument } from "../queries";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../CrmError";
import { DocumentDetail } from "./DocumentDetail";

export const dynamic = "force-dynamic";

export default async function DocumentDetailPage({ params }: { params: { id: string } }) {
  try {
    const doc = await getDocument(params.id);
    if (!doc) notFound();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
    return (
      <div className="p-6">
        <Link href="/app/documents" className="mb-4 inline-block text-sm hover:underline" style={{ color: "var(--kb-primary)" }}>
          Back to Documents
        </Link>
        <DocumentDetail
          appUrl={appUrl}
          doc={{
            id: doc.id,
            name: doc.name,
            kind: doc.kind,
            mimeType: doc.mimeType,
            sizeBytes: doc.sizeBytes,
            version: doc.version,
            bodyHtml: doc.bodyHtml,
            folder: doc.folder,
            versions: doc.versions.map((v) => ({
              id: v.id,
              version: v.version,
              name: v.name,
              sizeBytes: v.sizeBytes,
              createdAt: v.createdAt,
            })),
            shareLinks: doc.shareLinks,
            envelopes: doc.envelopes,
            updatedAt: doc.updatedAt,
          }}
        />
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
