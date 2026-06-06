import { listFolders, listFiles, listUploaders, storageStatus } from "../file-actions";
import { FilesClient } from "./FilesClient";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../CrmError";

export const dynamic = "force-dynamic";

export default async function FilesPage() {
  try {
    const [folders, files, uploaders, status] = await Promise.all([
      listFolders(),
      listFiles({ view: "all", folderId: null }),
      listUploaders(),
      storageStatus(),
    ]);
    return (
      <FilesClient
        initialFolders={folders}
        initialFiles={files}
        uploaders={uploaders}
        status={status}
      />
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
