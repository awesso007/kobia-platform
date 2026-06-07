/*
 * Documents browser (Sprint 14). SharePoint-style folder + file browser. The
 * ?folder= query selects the current folder (root when absent). Server component
 * loads the level and hands it to the client DocumentBrowser for interactions.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { browseFolder, listAllFolders } from "./queries";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../CrmError";
import { PageHeader } from "./DocumentsUI";
import { DocumentBrowser } from "./DocumentBrowser";

export const dynamic = "force-dynamic";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: { folder?: string };
}) {
  try {
    const folderId = searchParams.folder || null;
    const [{ folder, folders, documents }, allFolders] = await Promise.all([
      browseFolder(folderId),
      listAllFolders(),
    ]);
    return (
      <div className="p-6">
        <PageHeader
          title="Documents"
          subtitle="Folders, files, and collaborative docs with versions, sharing, and e-signature."
        />
        <DocumentBrowser folder={folder} folders={folders} documents={documents} allFolders={allFolders} />
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
