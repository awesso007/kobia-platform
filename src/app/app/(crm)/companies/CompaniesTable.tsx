"use client";

/*
 * Companies list view: filters, sortable headers, pagination, a create modal,
 * and an edit RecordPane. The Details tab carries an editable form plus Related
 * Contacts and Related Deals (loaded on open via loadCompanyDetail). Custom
 * fields and a tag picker render on both create and edit. Filters/sort/page live
 * in the URL so the server page re-queries.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowUpDown, Plus } from "lucide-react";
import { KbButton } from "@/components/crm/ui";
import { RecordPane } from "@/components/crm/record-pane/RecordPane";
import { TagChips } from "@/components/crm/TagChips";
import { TagPicker } from "@/components/crm/TagPicker";
import { CustomFieldInputs } from "@/components/crm/CustomFieldInputs";
import { formatCurrency } from "@/lib/utils";
import {
  COMPANY_SIZES,
  companySizeLabel,
  type CustomFieldDef,
  type CustomFieldValueMap,
  type TagRow,
} from "@/lib/crm/record";
import type { CompanyRow, RelatedContact, RelatedDeal } from "./queries";
import { createCompany, updateCompany, loadCompanyDetail, type CompanyInput } from "./actions";

export function CompaniesTable({
  rows,
  total,
  page,
  pageCount,
  owners,
  industries,
  allTags,
  customFields,
}: {
  rows: CompanyRow[];
  total: number;
  page: number;
  pageCount: number;
  owners: string[];
  industries: string[];
  allTags: TagRow[];
  customFields: CustomFieldDef[];
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CompanyRow | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const openId = sp.get("open");
  useEffect(() => {
    if (!openId) return;
    const row = rows.find((r) => r.id === openId);
    if (row) setEditing(row);
    const next = new URLSearchParams(sp.toString());
    next.delete("open");
    router.replace(`/app/companies${next.toString() ? `?${next.toString()}` : ""}`);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [openId]);

  useEffect(() => {
    const onNew = () => setCreating(true);
    const onFocusSearch = () => {
      searchRef.current?.focus();
      searchRef.current?.select();
    };
    const onEscape = () => {
      setCreating(false);
      setEditing(null);
    };
    window.addEventListener("kobia:new-record", onNew);
    window.addEventListener("kobia:focus-search", onFocusSearch);
    window.addEventListener("kobia:escape", onEscape);
    return () => {
      window.removeEventListener("kobia:new-record", onNew);
      window.removeEventListener("kobia:focus-search", onFocusSearch);
      window.removeEventListener("kobia:escape", onEscape);
    };
  }, []);

  function setParam(updates: Record<string, string | null>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    if (!("page" in updates)) next.delete("page");
    router.push(`/app/companies?${next.toString()}`);
  }

  function toggleSort(field: string) {
    const dir = sp.get("sort") === field && sp.get("dir") === "asc" ? "desc" : "asc";
    setParam({ sort: field, dir });
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="mb-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>CRM / Companies</div>
          <h1 style={{ fontSize: "var(--kb-fs-h1)", fontWeight: 600, color: "var(--kb-text-primary)" }}>Companies</h1>
        </div>
        <KbButton onClick={() => setCreating(true)}><Plus size={16} /> New company</KbButton>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          ref={searchRef}
          defaultValue={sp.get("search") ?? ""}
          placeholder="Search name, domain, website"
          onKeyDown={(e) => { if (e.key === "Enter") setParam({ search: (e.target as HTMLInputElement).value }); }}
          className="rounded px-3 py-1.5 text-sm outline-none"
          style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)", minWidth: 240 }}
        />
        <FilterSelect label="Industry" value={sp.get("industry") ?? ""} options={industries.map((i) => ({ value: i, label: i }))} onChange={(v) => setParam({ industry: v })} />
        <FilterSelect label="Owner" value={sp.get("owner") ?? ""} options={owners.map((o) => ({ value: o, label: o }))} onChange={(v) => setParam({ owner: v })} />
        <FilterSelect label="Tag" value={sp.get("tag") ?? ""} options={allTags.map((t) => ({ value: t.id, label: t.name }))} onChange={(v) => setParam({ tag: v })} />
      </div>

      <div className="grid gap-2 md:hidden">
        {rows.length === 0 ? (
          <p className="p-4 text-center text-sm" style={{ color: "var(--kb-text-secondary)" }}>No companies match these filters.</p>
        ) : (
          rows.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setEditing(c)}
              className="w-full p-3 text-left"
              style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)", boxShadow: "var(--kb-shadow-card)" }}
            >
              <div style={{ color: "var(--kb-text-primary)", fontWeight: 600 }}>{c.name}</div>
              {c.domain ? <div className="mt-0.5 text-xs" style={{ color: "var(--kb-text-secondary)" }}>{c.domain}</div> : null}
              <div className="mt-2 flex items-center justify-between text-xs" style={{ color: "var(--kb-text-secondary)" }}>
                <span>{c.industry ?? "-"}</span>
                <span>{companySizeLabel(c.size)}</span>
              </div>
              <div className="mt-2"><TagChips tags={c.tags} /></div>
            </button>
          ))
        )}
      </div>

      <div className="hidden overflow-x-auto md:block" style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)", boxShadow: "var(--kb-shadow-card)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: "var(--kb-surface-grey)", color: "var(--kb-text-secondary)" }}>
              <Th label="Name" field="name" onSort={toggleSort} />
              <Th label="Domain" field="domain" onSort={toggleSort} />
              <Th label="Industry" field="industry" onSort={toggleSort} />
              <Th label="Size" field="size" onSort={toggleSort} />
              <Th label="Owner" field="ownerUserId" onSort={toggleSort} />
              <th className="px-3 py-2 text-left font-medium">Tags</th>
              <Th label="Created" field="createdAt" onSort={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="p-8 text-center" style={{ color: "var(--kb-text-secondary)" }}>No companies match these filters.</td></tr>
            ) : (
              rows.map((c) => (
                <tr key={c.id} onClick={() => setEditing(c)} className="cursor-pointer" style={{ borderTop: "1px solid var(--kb-border)", height: "var(--kb-row-h)" }}>
                  <td className="px-3" style={{ color: "var(--kb-text-primary)", fontWeight: 500 }}>{c.name}</td>
                  <td className="px-3" style={{ color: "var(--kb-text-secondary)" }}>{c.domain ?? "-"}</td>
                  <td className="px-3" style={{ color: "var(--kb-text-secondary)" }}>{c.industry ?? "-"}</td>
                  <td className="px-3" style={{ color: "var(--kb-text-secondary)" }}>{companySizeLabel(c.size)}</td>
                  <td className="px-3" style={{ color: "var(--kb-text-secondary)" }}>{c.ownerUserId ?? "-"}</td>
                  <td className="px-3"><TagChips tags={c.tags} /></td>
                  <td className="px-3" style={{ color: "var(--kb-text-secondary)" }}>{new Date(c.createdAt).toLocaleDateString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm" style={{ color: "var(--kb-text-secondary)" }}>
        <span>{total} compan{total === 1 ? "y" : "ies"} - page {page} of {pageCount}</span>
        <div className="flex gap-2">
          <KbButton variant="outline" disabled={page <= 1} onClick={() => setParam({ page: String(page - 1) })}>Previous</KbButton>
          <KbButton variant="outline" disabled={page >= pageCount} onClick={() => setParam({ page: String(page + 1) })}>Next</KbButton>
        </div>
      </div>

      {creating ? (
        <CompanyModal allTags={allTags} customFields={customFields} onClose={() => setCreating(false)} />
      ) : null}
      {editing ? (
        <RecordPane
          type="company"
          id={editing.id}
          title={editing.name}
          subtitle={editing.domain ?? editing.website ?? undefined}
          onClose={() => setEditing(null)}
          details={<CompanyDetails company={editing} allTags={allTags} customFields={customFields} />}
        />
      ) : null}
    </div>
  );
}

function Th({ label, field, onSort }: { label: string; field: string; onSort: (f: string) => void }) {
  return (
    <th className="px-3 py-2 text-left font-medium">
      <button type="button" onClick={() => onSort(field)} className="inline-flex items-center gap-1">{label}<ArrowUpDown size={12} /></button>
    </th>
  );
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded px-2 py-1.5 text-sm outline-none" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)", color: value ? "var(--kb-text-primary)" : "var(--kb-text-secondary)" }}>
      <option value="">{label}: All</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function emptyForm(): CompanyInput {
  return { name: "", domain: "", industry: "", size: "", website: "", phone: "", address: "" };
}

function CompanyFormFields({ form, setForm }: { form: CompanyInput; setForm: (f: CompanyInput) => void }) {
  return (
    <>
      <Field label="Name"><Text value={form.name} onChange={(v) => setForm({ ...form, name: v })} autoFocus /></Field>
      <Field label="Domain"><Text value={form.domain ?? ""} onChange={(v) => setForm({ ...form, domain: v })} /></Field>
      <Field label="Industry"><Text value={form.industry ?? ""} onChange={(v) => setForm({ ...form, industry: v })} /></Field>
      <Field label="Size">
        <select value={form.size ?? ""} onChange={(e) => setForm({ ...form, size: e.target.value })} className="w-full rounded px-3 py-2 text-sm outline-none" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}>
          <option value="">Select...</option>
          {COMPANY_SIZES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </Field>
      <Field label="Website"><Text value={form.website ?? ""} onChange={(v) => setForm({ ...form, website: v })} /></Field>
      <Field label="Phone"><Text value={form.phone ?? ""} onChange={(v) => setForm({ ...form, phone: v })} /></Field>
      <Field label="Address"><Text value={form.address ?? ""} onChange={(v) => setForm({ ...form, address: v })} /></Field>
    </>
  );
}

function CompanyModal({ allTags, customFields, onClose }: { allTags: TagRow[]; customFields: CustomFieldDef[]; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<CompanyInput>(emptyForm());
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [cfValues, setCfValues] = useState<CustomFieldValueMap>({});

  function submit() {
    if (!form.name.trim()) return;
    startTransition(async () => {
      await createCompany({ ...form, tagIds, customFields: cfValues });
      onClose();
      router.refresh();
    });
  }

  return (
    <ModalShell title="New company" onClose={onClose}>
      <div className="space-y-3">
        <CompanyFormFields form={form} setForm={setForm} />
        <Field label="Tags"><TagPicker all={allTags} selected={tagIds} onChange={setTagIds} /></Field>
        <CustomFieldInputs fields={customFields} values={cfValues} onChange={(id, v) => setCfValues((p) => ({ ...p, [id]: v }))} />
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <KbButton variant="outline" onClick={onClose}>Cancel</KbButton>
        <KbButton onClick={submit} disabled={pending || !form.name.trim()}>{pending ? "Creating..." : "Create company"}</KbButton>
      </div>
    </ModalShell>
  );
}

function CompanyDetails({ company, allTags, customFields }: { company: CompanyRow; allTags: TagRow[]; customFields: CustomFieldDef[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<CompanyInput>({
    name: company.name,
    domain: company.domain ?? "",
    industry: company.industry ?? "",
    size: company.size ?? "",
    website: company.website ?? "",
    phone: company.phone ?? "",
    address: company.address ?? "",
  });
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [cfValues, setCfValues] = useState<CustomFieldValueMap>({});
  const [contacts, setContacts] = useState<RelatedContact[]>([]);
  const [deals, setDeals] = useState<RelatedDeal[]>([]);

  useEffect(() => {
    let active = true;
    loadCompanyDetail(company.id).then((d) => {
      if (!active) return;
      setContacts(d.relations.contacts);
      setDeals(d.relations.deals);
      setTagIds(d.tagIds);
      setCfValues(d.customValues);
    });
    return () => { active = false; };
  }, [company.id]);

  function save() {
    startTransition(async () => {
      await updateCompany(company.id, { ...form, tagIds, customFields: cfValues });
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <CompanyFormFields form={form} setForm={setForm} />
      <Field label="Tags"><TagPicker all={allTags} selected={tagIds} onChange={setTagIds} /></Field>
      <CustomFieldInputs fields={customFields} values={cfValues} onChange={(id, v) => setCfValues((p) => ({ ...p, [id]: v }))} />

      <RelatedSection title="Related contacts">
        {contacts.length === 0 ? <Empty /> : contacts.map((c) => (
          <RelatedRow key={c.id} primary={c.name} secondary={c.title ?? c.email ?? ""} />
        ))}
      </RelatedSection>
      <RelatedSection title="Related deals">
        {deals.length === 0 ? <Empty /> : deals.map((d) => (
          <RelatedRow key={d.id} primary={d.name} secondary={`${formatCurrency(d.amountCents / 100)} - ${d.status}`} />
        ))}
      </RelatedSection>

      <div className="flex gap-2 pt-2">
        <KbButton onClick={save} disabled={pending}>{pending ? "Saving..." : "Save"}</KbButton>
      </div>
    </div>
  );
}

function RelatedSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pt-2">
      <div className="mb-1 text-xs font-medium uppercase" style={{ color: "var(--kb-text-secondary)" }}>{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function RelatedRow({ primary, secondary }: { primary: string; secondary: string }) {
  return (
    <div className="rounded px-3 py-2 text-sm" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}>
      <div style={{ color: "var(--kb-text-primary)", fontWeight: 500 }}>{primary}</div>
      {secondary ? <div className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>{secondary}</div> : null}
    </div>
  );
}

function Empty() {
  return <p className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>None.</p>;
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-stretch overflow-auto sm:place-items-center sm:p-4" style={{ backgroundColor: "rgba(0,0,0,0.35)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="h-full w-full p-5 sm:h-auto sm:max-w-md sm:rounded" style={{ backgroundColor: "var(--kb-surface)", borderRadius: "var(--kb-radius)", boxShadow: "var(--kb-shadow-modal)" }}>
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
    <input value={value} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} className="w-full rounded px-3 py-2 text-sm outline-none" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }} />
  );
}
