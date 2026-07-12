/*
 * Workgroup tasks tab (Sprint 22). Server component: lists tasks linked to this
 * group (via Task.workgroupId). Read-only for now; creation happens in the Tasks
 * module. Renders gracefully when the group has no linked tasks.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { notFound } from "next/navigation";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../../CrmError";
import { loadGroupTasks } from "../../queries";

export const dynamic = "force-dynamic";

export default async function GroupTasksPage({ params }: { params: { slug: string } }) {
  try {
    const data = await loadGroupTasks(params.slug);
    if (!data) notFound();
    const { tasks } = data;
    return (
      <section className="p-4" style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)" }}>
        <h3 className="mb-2 text-sm font-semibold" style={{ color: "var(--kb-text-primary)" }}>Tasks ({tasks.length})</h3>
        {tasks.length === 0 ? (
          <p className="p-8 text-center text-sm" style={{ color: "var(--kb-text-secondary)" }}>No tasks linked to this group yet.</p>
        ) : (
          tasks.map((t) => (
            <div key={t.id} className="flex items-center justify-between border-t py-2" style={{ borderColor: "var(--kb-border)" }}>
              <p className="text-sm" style={{ color: "var(--kb-text-primary)" }}>{t.title}</p>
              <span className="rounded px-2 py-1 text-xs" style={{ border: "1px solid var(--kb-border)", color: "var(--kb-text-secondary)" }}>
                {t.status}{t.dueAt ? ` - due ${new Date(t.dueAt).toLocaleDateString()}` : ""}
              </span>
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
