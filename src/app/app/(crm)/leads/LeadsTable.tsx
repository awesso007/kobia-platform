"use client";

/*
 * Leads list view: top-bar filters, sortable table headers, pagination, a
 * create modal, and an edit RecordPane (Details tab carries an editable form).
 * Filters/sort/page live in the URL query string so the server page re-queries.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ArrowUpDown, Plus } from "lucide-react";
import { KbButton, StatusBadge } from "@/components/crm/ui";
import { RecordPane } from "@/components/crm/record-pane/RecordPane";
import { TagChips } from "@/components/crm/TagChips";
import { TagPicker } from "@/components/crm/TagPicker";
import { CustomFieldInputs } from "@/components/crm/CustomFieldInputs";
import type { CustomFieldDef, CustomFieldValueMap, TagRow } from "@/lib/crm/record";
import type { LeadRow } from "./queries";
import { createLead, updateLead, convertLeadToDeal, loadLeadDetail, type LeadInput } from "./actions";

const SOURCES = ["WEBSITE", "REFERRAL", "CALL", "EMAIL", "EVENT", "OTHER"];
const STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "UNQUALIFIED", "CONVERTED"];

export function LeadsTable({
  rows,
  total,
  page,
  pageCount,
  owners,
  allTags,
  customFields,
}: {
  rows: LeadRow[];
  total: number;
  page: number;
  pageCount: number;
  owners: string[];
  allTags: TagRow[];
  customFields: CustomFieldDef[];
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<LeadRow | null>(null);

  function setParam(updates: Record<string, string | null>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    if (!("page" in updates)) next.delete("page");
    router.push(`/app/leads?${next.toString()}`);
  }

  function toggleSort(field: string) {
    const curSort = sp.get("sort");
    const curDir = sp.get("dir");
    const dir = curSort === field && curDir === "asc" ? "desc" : "asc";
    setParam({ sort: field, dir });
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="mb-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>
            CRM / Leads
          </div>
          <h1 style={{ fontSize: "var(--kb-fs-h1)", fontWeight: 600, color: "var(--kb-text-primary)" }}>
            Leads
          </h1>
        </div>
        <KbButton onClick={() => setCreating(true)}>
          <Plus size={16} /> New lead
        </KbButton>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          defaultValue={sp.get("search") ?? ""}
          placeholder="Search name, email, company"
          onKeyDown={(e) => {
            if (e.key === "Enter") setParam({ search: (e.target as HTMLInputElement).value });
          }}
          className="rounded px-3 py-1.5 text-sm outline-none"
          style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)", minWidth: 240 }}
        />
        <FilterSelect label="Status" value={sp.get("status") ?? ""} options={STATUSES} onChange={(v) => setParam({ status: v })} />
        <FilterSelect label="Source" value={sp.get("source") ?? ""} options={SOURCES} onChange={(v) => setParam({ source: v })} />
        <FilterSelect label="Owner" value={sp.get("owner") ?? ""} options={owners} onChange={(v) => setParam({ owner: v })} />
      </div>

      <div
        className="overflow-hidden"
        style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)", boxShadow: "var(--kb-shadow-card)" }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: "var(--kb-surface-grey)", color: "var(--kb-text-secondary)" }}>
              <Th label="Name" field="name" onSort={toggleSort} />
              <Th label="Source" field="source" onSort={toggleSort} />
              <Th label="Status" field="status" onSort={toggleSort} />
              <Th label="Owner" field="ownerUserId" onSort={toggleSort} />
              <th className="px-3 py-2 text-left font-medium">Tags</th>
              <Th label="Created" field="createdAt" onSort={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center" style={{ color: "var(--kb-text-secondary)" }}>
                  No leads match these filters.
                </td>
              </tr>
            ) : (
              rows.map((l) => (
                <tr
                  key={l.id}
                  onClick={() => setEditing(l)}
                  className="cursor-pointer"
                  style={{ borderTop: "1px solid var(--kb-border)", height: "var(--kb-row-h)" }}
                >
                  <td className="px-3" style={{ color: "var(--kb-text-primary)", fontWeight: 500 }}>
                    {l.name}
                    {l.companyName ? (
                      <span className="ml-2 text-xs" style={{ color: "var(--kb-text-secondary)" }}>
                        {l.companyName}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3" style={{ color: "var(--kb-text-secondary)" }}>{l.source}</td>
                  <td className="px-3"><StatusBadge value={l.status} /></td>
                  <td className="px-3" style={{ color: "var(--kb-text-secondary)" }}>{l.ownerUserId ?? "-"}</td>
                  <td className="px-3"><TagChips tags={l.tags} /></td>
                  <td className="px-3" style={{ color: "var(--kb-text-secondary)" }}>
                    {new Date(l.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm" style={{ color: "var(--kb-text-secondary)" }}>
        <span>
          {total} lead{total === 1 ? "" : "s"} - page {page} of {pageCount}
        </span>
        <div className="flex gap-2">
          <KbButton variant="outline" disabled={page <= 1} onClick={() => setParam({ page: String(page - 1) })}>
            Previous
          </KbButton>
          <KbButton variant="outline" disabled={page >= pageCount} onClick={() => setParam({ page: String(page + 1) })}>
            Next
          </KbButton>
        </div>
      </div>

      {creating ? <LeadModal allTags={allTags} customFields={customFields} onClose={() => setCreating(false)} /> : null}
      {editing ? (
        <RecordPane
          type="lead"
          id={editing.id}
          title={editing.name}
          subtitle={editing.companyName ?? editing.email ?? undefined}
          onClose={() => setEditing(null)}
          details={<LeadDetails lead={editing} allTags={allTags} customFields={customFields} onConverted={() => setEditing(null)} />}
        />
      ) : null}
    </div>
  );
}

function Th({ label, field, onSort }: { label: string; field: string; onSort: (f: string) => void }) {
  return (
    <th className="px-3 py-2 text-left font-medium">
      <button type="button" onClick={() => onSort(field)} className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown size={12} />
      </button>
    </th>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded px-2 py-1.5 text-sm outline-none"
      style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)", color: value ? "var(--kb-text-primary)" : "var(--kb-text-secondary)" }}
    >
      <option value="">{label}: All</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function LeadDetails({ lead, allTags, customFields, onConverted }: { lead: LeadRow; allTags: TagRow[]; customFields: CustomFieldDef[]; onConverted: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<LeadInput>({
    name: lead.name,
    email: lead.email ?? "",
    phone: lead.phone ?? "",
    companyName: lead.companyName ?? "",
    source: lead.source,
    status: lead.status,
    notes: lead.notes ?? "",
  });
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [cfValues, setCfValues] = useState<CustomFieldValueMap>({});

  useEffect(() => {
    let active = true;
    loadLeadDetail(lead.id).then((d) => {
      if (!active) return;
      setTagIds(d.tagIds);
      setCfValues(d.customValues);
    });
    return () => { active = false; };
  }, [lead.id]);

  function save() {
    startTransition(async () => {
      await updateLead(lead.id, { ...form, tagIds, customFields: cfValues });
      router.refresh();
    });
  }

  function convert() {
    startTransition(async () => {
      await convertLeadToDeal(lead.id);
      onConverted();
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <Field label="Name"><Text value={form.name} onChange={(v) => setForm({ ...form, name: v })} /></Field>
      <Field label="Email"><Text value={form.email ?? ""} onChange={(v) => setForm({ ...form, email: v })} /></Field>
      <Field label="Phone"><Text value={form.phone ?? ""} onChange={(v) => setForm({ ...form, phone: v })} /></Field>
      <Field label="Company"><Text value={form.companyName ?? ""} onChange={(v) => setForm({ ...form, companyName: v })} /></Field>
      <Field label="Source">
        <Select value={form.source ?? "WEBSITE"} options={SOURCES} onChange={(v) => setForm({ ...form, source: v })} />
      </Field>
      <Field label="Status">
        <Select value={form.status ?? "NEW"} options={STATUSES} onChange={(v) => setForm({ ...form, status: v })} />
      </Field>
      <Field label="Notes">
        <textarea
          value={form.notes ?? ""}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          rows={3}
          className="w-full resize-none rounded px-3 py-2 text-sm outline-none"
          style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}
        />
      </Field>
      <Field label="Tags"><TagPicker all={allTags} selected={tagIds} onChange={setTagIds} /></Field>
      <CustomFieldInputs fields={customFields} values={cfValues} onChange={(id, v) => setCfValues((p) => ({ ...p, [id]: v }))} />
      <div className="flex gap-2 pt-2">
        <KbButton onClick={save} disabled={pending}>{pending ? "Saving..." : "Save"}</KbButton>
        <KbButton variant="outline" onClick={convert} disabled={pending || lead.status === "CONVERTED"}>
          Convert to deal
        </KbButton>
      </div>
    </div>
  );
}

function LeadModal({ allTags, customFields, onClose }: { allTags: TagRow[]; customFields: CustomFieldDef[]; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<LeadInput>({ name: "", email: "", phone: "", source: "WEBSITE", status: "NEW", notes: "" });
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [cfValues, setCfValues] = useState<CustomFieldValueMap>({});

  function submit() {
    if (!form.name.trim()) return;
    startTransition(async () => {
      await createLead({ ...form, tagIds, customFields: cfValues });
      onClose();
      router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center" style={{ backgroundColor: "rgba(0,0,0,0.35)" }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md p-5"
        style={{ backgroundColor: "var(--kb-surface)", borderRadius: "var(--kb-radius)", boxShadow: "var(--kb-shadow-modal)" }}
      >
        <h2 className="mb-4" style={{ fontSize: "var(--kb-fs-section)", fontWeight: 600, color: "var(--kb-text-primary)" }}>
          New lead
        </h2>
        <div className="space-y-3">
          <Field label="Name"><Text value={form.name} onChange={(v) => setForm({ ...form, name: v })} autoFocus /></Field>
          <Field label="Email"><Text value={form.email ?? ""} onChange={(v) => setForm({ ...form, email: v })} /></Field>
          <Field label="Phone"><Text value={form.phone ?? ""} onChange={(v) => setForm({ ...form, phone: v })} /></Field>
          <Field label="Source"><Select value={form.source ?? "WEBSITE"} options={SOURCES} onChange={(v) => setForm({ ...form, source: v })} /></Field>
          <Field label="Status"><Select value={form.status ?? "NEW"} options={STATUSES} onChange={(v) => setForm({ ...form, status: v })} /></Field>
          <Field label="Notes">
            <textarea
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              className="w-full resize-none rounded px-3 py-2 text-sm outline-none"
              style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}
            />
          </Field>
          <Field label="Tags"><TagPicker all={allTags} selected={tagIds} onChange={setTagIds} /></Field>
          <CustomFieldInputs fields={customFields} values={cfValues} onChange={(id, v) => setCfValues((p) => ({ ...p, [id]: v }))} />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <KbButton variant="outline" onClick={onClose}>Cancel</KbButton>
          <KbButton onClick={submit} disabled={pending || !form.name.trim()}>{pending ? "Creating..." : "Create lead"}</KbButton>
        </div>
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
    <input
      value={value}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded px-3 py-2 text-sm outline-none"
      style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}
    />
  );
}

function Select({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded px-3 py-2 text-sm outline-none"
      style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}
    >
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}
