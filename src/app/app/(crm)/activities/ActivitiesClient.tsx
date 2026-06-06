"use client";

/*
 * Activities client shell. Toggles two views (List default, Calendar) via the
 * ?view= URL param so the server re-queries. List has type/owner/status/date/
 * related-type filters, sortable headers, pagination, and a quick-complete
 * checkbox per row. Calendar is a plain month grid (date-fns for date math, no
 * calendar lib): click a day to see its activities, click an activity to open
 * the parent record's RecordPane on its Activity tab. A create/edit modal
 * captures type/subject/description/dueAt/owner/related-record.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  ArrowUpDown,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  List as ListIcon,
  Phone,
  Mail,
  Users,
  CheckSquare,
  StickyNote,
  Plus,
  Trash2,
} from "lucide-react";
import {
  addDays,
  endOfMonth,
  format,
  isSameDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { KbButton } from "@/components/crm/ui";
import { RecordPane } from "@/components/crm/record-pane/RecordPane";
import { ACTIVITY_TYPES, type ActivityKind, type RecordType } from "@/lib/crm/record";
import type { ActivityListRow } from "./queries";
import { createActivity, updateActivity, setActivityComplete, deleteActivity, type ActivityInput } from "./actions";

type RelatedOptions = {
  lead: { id: string; label: string }[];
  deal: { id: string; label: string }[];
  contact: { id: string; label: string }[];
  company: { id: string; label: string }[];
};

const TYPE_ICON: Record<ActivityKind, typeof Phone> = {
  CALL: Phone,
  EMAIL: Mail,
  MEETING: Users,
  TASK: CheckSquare,
  NOTE: StickyNote,
};

const inputStyle: React.CSSProperties = {
  border: "1px solid var(--kb-border)",
  borderRadius: "var(--kb-radius-sm)",
};

function statusOf(a: ActivityListRow): "Done" | "Overdue" | "Open" {
  if (a.completedAt) return "Done";
  if (a.dueAt && new Date(a.dueAt).getTime() < Date.now()) return "Overdue";
  return "Open";
}

export function ActivitiesClient({
  view,
  rows,
  total,
  page,
  pageCount,
  owners,
  related,
  calendarRows,
  year,
  month,
}: {
  view: "list" | "calendar";
  rows: ActivityListRow[];
  total: number;
  page: number;
  pageCount: number;
  owners: string[];
  related: RelatedOptions;
  calendarRows: ActivityListRow[];
  year: number;
  month: number;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ActivityListRow | null>(null);
  const [openRecord, setOpenRecord] = useState<{ type: RecordType; id: string; label: string } | null>(null);

  function setParam(updates: Record<string, string | null>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    if (!("page" in updates)) next.delete("page");
    router.push(`/app/activities?${next.toString()}`);
  }

  function toggleSort(field: string) {
    const dir = sp.get("sort") === field && sp.get("dir") === "asc" ? "desc" : "asc";
    setParam({ sort: field, dir });
  }

  function openActivity(a: ActivityListRow) {
    if (a.related) setOpenRecord(a.related);
    else setEditing(a);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="mb-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>CRM / Activities</div>
          <h1 style={{ fontSize: "var(--kb-fs-h1)", fontWeight: 600, color: "var(--kb-text-primary)" }}>Activities</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}>
            <ViewToggle active={view === "list"} onClick={() => setParam({ view: null })}><ListIcon size={14} /> List</ViewToggle>
            <ViewToggle active={view === "calendar"} onClick={() => setParam({ view: "calendar" })}><CalendarDays size={14} /> Calendar</ViewToggle>
          </div>
          <KbButton onClick={() => setCreating(true)}><Plus size={16} /> New activity</KbButton>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <FilterSelect label="Type" value={sp.get("type") ?? ""} options={ACTIVITY_TYPES.map((t) => ({ value: t, label: t }))} onChange={(v) => setParam({ type: v })} />
        <FilterSelect label="Owner" value={sp.get("owner") ?? ""} options={owners.map((o) => ({ value: o, label: o }))} onChange={(v) => setParam({ owner: v })} />
        <FilterSelect label="Status" value={sp.get("status") ?? ""} options={[{ value: "open", label: "Open" }, { value: "done", label: "Done" }, { value: "overdue", label: "Overdue" }]} onChange={(v) => setParam({ status: v })} />
        <FilterSelect label="Related" value={sp.get("relatedType") ?? ""} options={[{ value: "lead", label: "Lead" }, { value: "deal", label: "Deal" }, { value: "contact", label: "Contact" }, { value: "company", label: "Company" }]} onChange={(v) => setParam({ relatedType: v })} />
        {view === "list" ? (
          <>
            <DateInput value={sp.get("from") ?? ""} placeholder="From" onChange={(v) => setParam({ from: v })} />
            <DateInput value={sp.get("to") ?? ""} placeholder="To" onChange={(v) => setParam({ to: v })} />
          </>
        ) : null}
      </div>

      {view === "list" ? (
        <ListView
          rows={rows}
          total={total}
          page={page}
          pageCount={pageCount}
          onSort={toggleSort}
          onOpen={openActivity}
          onPage={(p) => setParam({ page: String(p) })}
        />
      ) : (
        <CalendarView rows={calendarRows} year={year} month={month} onShiftMonth={(y, m) => setParam({ year: String(y), month: String(m) })} onOpen={openActivity} />
      )}

      {creating ? (
        <ActivityModal related={related} owners={owners} onClose={() => setCreating(false)} />
      ) : null}
      {editing ? (
        <ActivityModal activity={editing} related={related} owners={owners} onClose={() => setEditing(null)} />
      ) : null}
      {openRecord ? (
        <RecordPane
          type={openRecord.type}
          id={openRecord.id}
          title={openRecord.label}
          initialTab="activity"
          onClose={() => setOpenRecord(null)}
        />
      ) : null}
    </div>
  );
}

function ListView({
  rows,
  total,
  page,
  pageCount,
  onSort,
  onOpen,
  onPage,
}: {
  rows: ActivityListRow[];
  total: number;
  page: number;
  pageCount: number;
  onSort: (f: string) => void;
  onOpen: (a: ActivityListRow) => void;
  onPage: (p: number) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggleComplete(a: ActivityListRow) {
    startTransition(async () => {
      await setActivityComplete(a.id, !a.completedAt);
      router.refresh();
    });
  }

  return (
    <>
      <div className="overflow-hidden" style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)", boxShadow: "var(--kb-shadow-card)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: "var(--kb-surface-grey)", color: "var(--kb-text-secondary)" }}>
              <th className="px-3 py-2 text-left font-medium" style={{ width: 36 }}></th>
              <Th label="Type" field="type" onSort={onSort} />
              <Th label="Subject" field="subject" onSort={onSort} />
              <th className="px-3 py-2 text-left font-medium">Related</th>
              <th className="px-3 py-2 text-left font-medium">Owner</th>
              <Th label="Due" field="dueAt" onSort={onSort} />
              <th className="px-3 py-2 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="p-8 text-center" style={{ color: "var(--kb-text-secondary)" }}>No activities match these filters.</td></tr>
            ) : (
              rows.map((a) => {
                const Icon = TYPE_ICON[a.type];
                const status = statusOf(a);
                return (
                  <tr key={a.id} style={{ borderTop: "1px solid var(--kb-border)", height: "var(--kb-row-h)" }}>
                    <td className="px-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={Boolean(a.completedAt)}
                        disabled={pending}
                        onChange={() => toggleComplete(a)}
                        aria-label="Mark complete"
                      />
                    </td>
                    <td className="cursor-pointer px-3" onClick={() => onOpen(a)} style={{ color: "var(--kb-text-secondary)" }}>
                      <span className="inline-flex items-center gap-1.5"><Icon size={14} /> {a.type}</span>
                    </td>
                    <td className="cursor-pointer px-3" onClick={() => onOpen(a)} style={{ color: "var(--kb-text-primary)", fontWeight: 500, textDecoration: a.completedAt ? "line-through" : "none" }}>{a.subject}</td>
                    <td className="cursor-pointer px-3" onClick={() => onOpen(a)} style={{ color: "var(--kb-primary)" }}>{a.related ? a.related.label : "-"}</td>
                    <td className="px-3" style={{ color: "var(--kb-text-secondary)" }}>{a.ownerClerkUserId ?? "-"}</td>
                    <td className="px-3" style={{ color: "var(--kb-text-secondary)" }}>{a.dueAt ? new Date(a.dueAt).toLocaleString() : "-"}</td>
                    <td className="px-3"><StatusPill status={status} /></td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm" style={{ color: "var(--kb-text-secondary)" }}>
        <span>{total} activit{total === 1 ? "y" : "ies"} - page {page} of {pageCount}</span>
        <div className="flex gap-2">
          <KbButton variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</KbButton>
          <KbButton variant="outline" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>Next</KbButton>
        </div>
      </div>
    </>
  );
}

function CalendarView({
  rows,
  year,
  month,
  onShiftMonth,
  onOpen,
}: {
  rows: ActivityListRow[];
  year: number;
  month: number;
  onShiftMonth: (y: number, m: number) => void;
  onOpen: (a: ActivityListRow) => void;
}) {
  const [selected, setSelected] = useState<Date | null>(null);

  const monthStart = new Date(Date.UTC(year, month, 1));
  const gridStart = startOfWeek(startOfMonth(monthStart), { weekStartsOn: 0 });
  const monthEnd = endOfMonth(monthStart);

  const days: Date[] = useMemo(() => {
    const out: Date[] = [];
    let d = gridStart;
    for (let i = 0; i < 42; i++) {
      out.push(d);
      d = addDays(d, 1);
    }
    return out;
  }, [gridStart]);

  const byDay = useMemo(() => {
    const map = new Map<string, ActivityListRow[]>();
    for (const a of rows) {
      if (!a.dueAt) continue;
      const key = format(new Date(a.dueAt), "yyyy-MM-dd");
      const list = map.get(key) ?? [];
      list.push(a);
      map.set(key, list);
    }
    return map;
  }, [rows]);

  function prevMonth() {
    const d = new Date(Date.UTC(year, month - 1, 1));
    onShiftMonth(d.getUTCFullYear(), d.getUTCMonth());
  }
  function nextMonth() {
    const d = new Date(Date.UTC(year, month + 1, 1));
    onShiftMonth(d.getUTCFullYear(), d.getUTCMonth());
  }

  const selectedKey = selected ? format(selected, "yyyy-MM-dd") : null;
  const selectedActivities = selectedKey ? byDay.get(selectedKey) ?? [] : [];

  return (
    <div className="flex gap-4">
      <div className="flex-1 overflow-hidden" style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)", boxShadow: "var(--kb-shadow-card)" }}>
        <div className="flex items-center justify-between p-3" style={{ borderBottom: "1px solid var(--kb-border)" }}>
          <button type="button" onClick={prevMonth} aria-label="Previous month" style={{ color: "var(--kb-text-secondary)" }}><ChevronLeft size={18} /></button>
          <span style={{ fontWeight: 600, color: "var(--kb-text-primary)" }}>{format(monthStart, "MMMM yyyy")}</span>
          <button type="button" onClick={nextMonth} aria-label="Next month" style={{ color: "var(--kb-text-secondary)" }}><ChevronRight size={18} /></button>
        </div>
        <div className="grid grid-cols-7" style={{ color: "var(--kb-text-secondary)" }}>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="px-2 py-1 text-center text-xs font-medium">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const key = format(d, "yyyy-MM-dd");
            const inMonth = d >= monthStart && d <= monthEnd;
            const dayActs = byDay.get(key) ?? [];
            const isSelected = selected ? isSameDay(d, selected) : false;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelected(d)}
                className="min-h-[84px] p-1 text-left align-top"
                style={{
                  borderTop: "1px solid var(--kb-border)",
                  borderRight: "1px solid var(--kb-border)",
                  backgroundColor: isSelected ? "var(--kb-surface-grey)" : "transparent",
                  opacity: inMonth ? 1 : 0.4,
                }}
              >
                <div className="mb-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>{format(d, "d")}</div>
                <div className="space-y-0.5">
                  {dayActs.slice(0, 3).map((a) => (
                    <div key={a.id} className="truncate rounded px-1 text-[11px]" style={{ backgroundColor: "var(--kb-primary)1a", color: "var(--kb-primary)" }}>{a.subject}</div>
                  ))}
                  {dayActs.length > 3 ? <div className="text-[11px]" style={{ color: "var(--kb-text-secondary)" }}>+{dayActs.length - 3} more</div> : null}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="w-72 shrink-0">
        <div className="p-3" style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)", boxShadow: "var(--kb-shadow-card)" }}>
          <div className="mb-2 text-sm font-medium" style={{ color: "var(--kb-text-primary)" }}>
            {selected ? format(selected, "EEEE, MMM d") : "Select a day"}
          </div>
          {!selected ? (
            <p className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>Click a day to see its activities.</p>
          ) : selectedActivities.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>No activities due.</p>
          ) : (
            <ul className="space-y-2">
              {selectedActivities.map((a) => {
                const Icon = TYPE_ICON[a.type];
                return (
                  <li key={a.id}>
                    <button type="button" onClick={() => onOpen(a)} className="flex w-full items-start gap-2 rounded p-2 text-left" style={inputStyle}>
                      <Icon size={14} style={{ marginTop: 2, color: "var(--kb-text-secondary)" }} />
                      <span>
                        <span className="block text-sm" style={{ color: "var(--kb-text-primary)" }}>{a.subject}</span>
                        {a.related ? <span className="block text-xs" style={{ color: "var(--kb-text-secondary)" }}>{a.related.label}</span> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function ActivityModal({
  activity,
  related,
  owners,
  onClose,
}: {
  activity?: ActivityListRow;
  related: RelatedOptions;
  owners: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<ActivityInput>({
    type: activity?.type ?? "TASK",
    subject: activity?.subject ?? "",
    body: activity?.body ?? "",
    dueAt: activity?.dueAt ? toLocalInput(activity.dueAt) : "",
    ownerClerkUserId: activity?.ownerClerkUserId ?? "",
    relatedType: activity?.related?.type ?? "",
    relatedId: activity?.related?.id ?? "",
  });

  const relatedList = form.relatedType ? related[form.relatedType as RecordType] ?? [] : [];

  function submit() {
    if (!form.subject.trim()) return;
    const payload: ActivityInput = {
      ...form,
      dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
    };
    startTransition(async () => {
      if (activity) await updateActivity(activity.id, payload);
      else await createActivity(payload);
      onClose();
      router.refresh();
    });
  }

  function remove() {
    if (!activity) return;
    startTransition(async () => {
      await deleteActivity(activity.id);
      onClose();
      router.refresh();
    });
  }

  return (
    <ModalShell title={activity ? "Edit activity" : "New activity"} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Type">
          <Select value={form.type} onChange={(v) => setForm({ ...form, type: v })} options={ACTIVITY_TYPES.map((t) => ({ value: t, label: t }))} />
        </Field>
        <Field label="Subject"><Text value={form.subject} onChange={(v) => setForm({ ...form, subject: v })} autoFocus /></Field>
        <Field label="Description">
          <textarea value={form.body ?? ""} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={3} className="w-full rounded px-3 py-2 text-sm outline-none" style={inputStyle} />
        </Field>
        <Field label="Due"><input type="datetime-local" value={form.dueAt ?? ""} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} className="w-full rounded px-3 py-2 text-sm outline-none" style={inputStyle} /></Field>
        <Field label="Owner">
          <Select value={form.ownerClerkUserId ?? ""} onChange={(v) => setForm({ ...form, ownerClerkUserId: v })} options={[{ value: "", label: "Unassigned" }, ...owners.map((o) => ({ value: o, label: o }))]} />
        </Field>
        <Field label="Related record">
          <div className="flex gap-2">
            <Select
              value={form.relatedType ?? ""}
              onChange={(v) => setForm({ ...form, relatedType: v, relatedId: "" })}
              options={[{ value: "", label: "None" }, { value: "lead", label: "Lead" }, { value: "deal", label: "Deal" }, { value: "contact", label: "Contact" }, { value: "company", label: "Company" }]}
            />
            {form.relatedType ? (
              <Select
                value={form.relatedId ?? ""}
                onChange={(v) => setForm({ ...form, relatedId: v })}
                options={[{ value: "", label: "Select..." }, ...relatedList.map((r) => ({ value: r.id, label: r.label }))]}
              />
            ) : null}
          </div>
        </Field>
      </div>
      <div className="mt-5 flex items-center justify-between">
        <div>
          {activity ? (
            <button type="button" onClick={remove} disabled={pending} className="inline-flex items-center gap-1 text-sm" style={{ color: "var(--kb-error)" }}><Trash2 size={14} /> Delete</button>
          ) : null}
        </div>
        <div className="flex gap-2">
          <KbButton variant="outline" onClick={onClose}>Cancel</KbButton>
          <KbButton onClick={submit} disabled={pending || !form.subject.trim()}>{pending ? "Saving..." : activity ? "Save" : "Create activity"}</KbButton>
        </div>
      </div>
    </ModalShell>
  );
}

function ViewToggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm"
      style={{ backgroundColor: active ? "var(--kb-primary)" : "var(--kb-surface)", color: active ? "#fff" : "var(--kb-text-secondary)" }}
    >
      {children}
    </button>
  );
}

function Th({ label, field, onSort }: { label: string; field: string; onSort: (f: string) => void }) {
  return (
    <th className="px-3 py-2 text-left font-medium">
      <button type="button" onClick={() => onSort(field)} className="inline-flex items-center gap-1">{label}<ArrowUpDown size={12} /></button>
    </th>
  );
}

function StatusPill({ status }: { status: "Done" | "Overdue" | "Open" }) {
  const color = status === "Done" ? "var(--kb-success)" : status === "Overdue" ? "var(--kb-error)" : "var(--kb-primary)";
  return <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`, color, borderRadius: "var(--kb-radius-sm)" }}>{status}</span>;
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded px-2 py-1.5 text-sm outline-none" style={{ ...inputStyle, color: value ? "var(--kb-text-primary)" : "var(--kb-text-secondary)" }}>
      <option value="">{label}: All</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function DateInput({ value, placeholder, onChange }: { value: string; placeholder: string; onChange: (v: string) => void }) {
  return (
    <input type="date" value={value} title={placeholder} onChange={(e) => onChange(e.target.value)} className="rounded px-2 py-1.5 text-sm outline-none" style={{ ...inputStyle, color: value ? "var(--kb-text-primary)" : "var(--kb-text-secondary)" }} />
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-auto p-4" style={{ backgroundColor: "rgba(0,0,0,0.35)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md p-5" style={{ backgroundColor: "var(--kb-surface)", borderRadius: "var(--kb-radius)", boxShadow: "var(--kb-shadow-modal)" }}>
        <h2 className="mb-4" style={{ fontSize: "var(--kb-fs-section)", fontWeight: 600, color: "var(--kb-text-primary)" }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs" style={{ color: "var(--kb-text-secondary)" }}>{label}</span>
      {children}
    </label>
  );
}

function Text({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <input value={value} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} className="w-full rounded px-3 py-2 text-sm outline-none" style={inputStyle} />
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded px-3 py-2 text-sm outline-none" style={inputStyle}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/** ISO -> value for <input type=datetime-local> in local time. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
