/*
 * Workgroup calendar tab (Sprint 22). Server component: lists calendar events
 * linked to this group (via CalendarEvent.workgroupId). Read-only for now;
 * scheduling happens in the Calendar module.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { notFound } from "next/navigation";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../../CrmError";
import { loadGroupEvents } from "../../queries";

export const dynamic = "force-dynamic";

export default async function GroupCalendarPage({ params }: { params: { slug: string } }) {
  try {
    const data = await loadGroupEvents(params.slug);
    if (!data) notFound();
    const { events } = data;
    return (
      <section className="p-4" style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)" }}>
        <h3 className="mb-2 text-sm font-semibold" style={{ color: "var(--kb-text-primary)" }}>Events ({events.length})</h3>
        {events.length === 0 ? (
          <p className="p-8 text-center text-sm" style={{ color: "var(--kb-text-secondary)" }}>No events linked to this group yet.</p>
        ) : (
          events.map((e) => (
            <div key={e.id} className="flex items-center justify-between border-t py-2" style={{ borderColor: "var(--kb-border)" }}>
              <div>
                <p className="text-sm" style={{ color: "var(--kb-text-primary)" }}>{e.title}</p>
                {e.location && <p className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>{e.location}</p>}
              </div>
              <span className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>{new Date(e.startAt).toLocaleString()}</span>
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
