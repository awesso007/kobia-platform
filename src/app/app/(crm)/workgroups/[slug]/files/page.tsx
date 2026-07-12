/*
 * Workgroup files tab (Sprint 22). Server component: lists documents linked to
 * this group (via Document.workgroupId). Read-only for now; uploads happen in
 * the Files module. Renders gracefully when the group has no linked files.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { notFound } from "next/navigation";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../../CrmError";
import { loadGroupFiles } from "../../queries";

export const dynamic = "force-dynamic";

function fmtSize(bytes: number): string {
  if (bytes <= 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

export default async function GroupFilesPage({ params }: { params: { slug: string } }) {
  try {
    const data = await loadGroupFiles(params.slug);
    if (!data) notFound();
    const { files } = data;
    return (
      <section className="p-4" style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)" }}>
        <h3 className="mb-2 text-sm font-semibold" style={{ color: "var(--kb-text-primary)" }}>Files ({files.length})</h3>
        {files.length === 0 ? (
          <p className="p-8 text-center text-sm" style={{ color: "var(--kb-text-secondary)" }}>No files linked to this group yet.</p>
        ) : (
          files.map((f) => (
            <div key={f.id} className="flex items-center justify-between border-t py-2" style={{ borderColor: "var(--kb-border)" }}>
              <p className="text-sm" style={{ color: "var(--kb-text-primary)" }}>{f.name}</p>
              <span className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>{f.kind === "FILE" ? fmtSize(f.sizeBytes) : f.kind.toLowerCase()}</span>
            </div>
          ))
        )}
      </section>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
