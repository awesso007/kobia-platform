/*
 * DOC editor page (Sprint 14). Loads the document body and version, then mounts
 * the client editor. Only meaningful for DOC-kind documents.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { notFound, redirect } from "next/navigation";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../../../CrmError";
import { DocEditor } from "./DocEditor";

export const dynamic = "force-dynamic";

export default async function DocEditPage({ params }: { params: { id: string } }) {
  try {
    const { db } = getTenantDb();
    const doc = await db.document.findUnique({ where: { id: params.id } });
    if (!doc) notFound();
    if (doc.kind !== "DOC") redirect(`/app/documents/${doc.id}`);
    return <DocEditor id={doc.id} name={doc.name} version={doc.version} initialHtml={doc.bodyHtml ?? "<p></p>"} />;
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
