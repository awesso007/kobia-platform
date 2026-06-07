/*
 * New envelope (Sprint 14). Loads the document picker list and mounts the
 * client wizard. ?documentId= preselects a document (used by the "Send for
 * signature" action on the document detail page).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { listDocumentsForPicker } from "../../queries";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../../CrmError";
import { PageHeader } from "../../DocumentsUI";
import { EnvelopeWizard } from "./EnvelopeWizard";

export const dynamic = "force-dynamic";

export default async function NewEnvelopePage({ searchParams }: { searchParams: { documentId?: string } }) {
  try {
    const documents = await listDocumentsForPicker();
    return (
      <div className="p-6">
        <PageHeader title="New signature request" subtitle="Pick a document, add signers, and send for signature." />
        <EnvelopeWizard documents={documents} initialDocumentId={searchParams.documentId ?? null} />
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
