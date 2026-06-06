"use client";

/*
 * Contacts list view: filters, sortable headers, pagination, a create modal
 * (with a company typeahead + tag picker + custom fields), and an edit
 * RecordPane whose Details tab shows the editable record plus Linked Company and
 * Linked Deals (loaded on open via loadContactDetail). Filters/sort/page live in
 * the URL so the server page re-queries.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { ArrowUpDown, Plus } from "lucide-react";
import { KbButton } from "@/components/crm/ui";
import { RecordPane } from "@/components/crm/record-pane/RecordPane";
import { TagChips } from "@/components/crm/TagChips";
import { TagPicker } from "@/components/crm/TagPicker";
import { CustomFieldInputs } from "@/components/crm/CustomFieldInputs";
import { formatCurrency } from "@/lib/utils";
import type { CustomFieldDef, CustomFieldValueMap, TagRow } from "@/lib/crm/record";
import type { ContactRow, LinkedCompany, LinkedDeal } from "./queries";
import { createContact, updateContact, loadContactDetail, type ContactInput } from "./actions";

type CompanyOption = { id: string; name: string };

export function ContactsTable({
  rows,
  total,
  page,
  pageCount,
  owners,
  companies,
  allTags,
  customFields,
}: {
  rows: ContactRow[];
  total: number;
  page: number;
  pageCount: number;
  owners: string[];
  companies: CompanyOption[];
  allTags: TagRow[];
  customFields: CustomFieldDef[];
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ContactRow | null>(null);

  function setParam(updates: Record<string, string | null>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    if (!("page" in updates)) next.delete("page");
    router.push(`/app/contacts?${next.toString()}`);
  }

  function toggleSort(field: string) {
    const dir = sp.get("sort") === field && sp.get("dir") === "asc" ? "desc" : "asc";
    setParam({ sort: field, dir });
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="mb-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>CRM / Contacts</div>
          <h1 style={{ fontSize: "var(--kb-fs-h1)", fontWeight: 600, color: "var(--kb-text-primary)" }}>Contacts</h1>
        </div>
        <KbButton onClick={() => setCreating(true)}><Plus size={16} /> New contact</KbButton>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          defaultValue={sp.get("search") ?? ""}
          placeholder="Search name, email"
          onKeyDown={(e) => { if (e.key === "Enter") setParam({ search: (e.target as HTMLInputElement).value }); }}
          className="rounded px-3 py-1.5 text-sm outline-none"
          style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)", minWidth: 240 }}
        />
        <FilterSelect label="Company" value={sp.get("company") ?? ""} options={companies.map((c) => ({ value: c.id, label: c.name }))} onChange={(v) => setParam({ company: v })} />
        <FilterSelect label="Owner" value={sp.get("owner") ?? ""} options={owners.map((o) => ({ value: o, label: o }))} onChange={(v) => setParam({ owner: v })} />
        <FilterSelect label="Tag" value={sp.get("tag") ?? ""} options={allTags.map((t) => ({ value: t.id, label: t.name }))} onChange={(v) => setParam({ tag: v })} />
      </div>

      <div className="overflow-hidden" style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)", boxShadow: "var(--kb-shadow-card)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: "var(--kb-surface-grey)", color: "var(--kb-text-secondary)" }}>
              <Th label="Name" field="lastName" onSort={toggleSort} />
              <Th label="Email" field="email" onSort={toggleSort} />
              <th className="px-3 py-2 text-left font-medium">Phone</th>
              <th className="px-3 py-2 text-left font-medium">Company</th>
              <th className="px-3 py-2 text-left font-medium">Owner</th>
              <th className="px-3 py-2 text-left font-medium">Tags</th>
              <Th label="Created" field="createdAt" onSort={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="p-8 text-center" style={{ color: "var(--kb-text-secondary)" }}>No contacts match these filters.</td></tr>
            ) : (
              rows.map((c) => (
                <tr key={c.id} onClick={() => setEditing(c)} className="cursor-pointer" style={{ borderTop: "1px solid var(--kb-border)", height: "var(--kb-row-h)" }}>
                  <td className="px-3" style={{ color: "var(--kb-text-primary)", fontWeight: 500 }}>{c.name}{c.title ? <span className="ml-2 text-xs" style={{ color: "var(--kb-text-secondary)" }}>{c.title}</span> : null}</td>
                  <td className="px-3" style={{ color: "var(--kb-text-secondary)" }}>{c.email ?? "-"}</td>
                  <td className="px-3" style={{ color: "var(--kb-text-secondary)" }}>{c.phone ?? "-"}</td>
                  <td className="px-3" style={{ color: "var(--kb-text-secondary)" }}>{c.companyName ?? "-"}</td>
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
        <span>{total} contact{total === 1 ? "" : "s"} - page {page} of {pageCount}</span>
        <div className="flex gap-2">
          <KbButton variant="outline" disabled={page <= 1} onClick={() => setParam({ page: String(page - 1) })}>Previous</KbButton>
          <KbButton variant="outline" disabled={page >= pageCount} onClick={() => setParam({ page: String(page + 1) })}>Next</KbButton>
        </div>
      </div>

      {creating ? (
        <ContactModal companies={companies} allTags={allTags} customFields={customFields} onClose={() => setCreating(false)} />
      ) : null}
      {editing ? (
        <RecordPane
          type="contact"
          id={editing.id}
          title={editing.name}
          subtitle={editing.companyName ?? editing.email ?? undefined}
          onClose={() => setEditing(null)}
          details={<ContactDetails contact={editing} companies={companies} allTags={allTags} customFields={customFields} />}
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

function CompanyTypeahead({ companies, value, onChange }: { companies: CompanyOption[]; value: string; onChange: (id: string) => void }) {
  const selected = companies.find((c) => c.id === value);
  const [query, setQuery] = useState(selected?.name ?? "");
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return companies.slice(0, 8);
    return companies.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 8);
  }, [query, companies]);

  return (
    <div className="relative">
      <input
        value={query}
        placeholder="Search companies"
        onChange={(e) => { setQuery(e.target.value); setOpen(true); if (!e.target.value) onChange(""); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="w-full rounded px-3 py-2 text-sm outline-none"
        style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}
      />
      {open && matches.length > 0 ? (
        <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded" style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", boxShadow: "var(--kb-shadow-card)" }}>
          {matches.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); onChange(c.id); setQuery(c.name); setOpen(false); }}
                className="block w-full px-3 py-2 text-left text-sm"
                style={{ color: c.id === value ? "var(--kb-primary)" : "var(--kb-text-primary)" }}
              >
                {c.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ContactFormFields({ form, setForm, companies }: { form: ContactInput; setForm: (f: ContactInput) => void; companies: CompanyOption[] }) {
  return (
    <>
      <Field label="First name"><Text value={form.firstName} onChange={(v) => setForm({ ...form, firstName: v })} autoFocus /></Field>
      <Field label="Last name"><Text value={form.lastName ?? ""} onChange={(v) => setForm({ ...form, lastName: v })} /></Field>
      <Field label="Email"><Text value={form.email ?? ""} onChange={(v) => setForm({ ...form, email: v })} /></Field>
      <Field label="Phone"><Text value={form.phone ?? ""} onChange={(v) => setForm({ ...form, phone: v })} /></Field>
      <Field label="Title"><Text value={form.title ?? ""} onChange={(v) => setForm({ ...form, title: v })} /></Field>
      <Field label="Company"><CompanyTypeahead companies={companies} value={form.companyId ?? ""} onChange={(id) => setForm({ ...form, companyId: id })} /></Field>
    </>
  );
}

function ContactModal({ companies, allTags, customFields, onClose }: { companies: CompanyOption[]; allTags: TagRow[]; customFields: CustomFieldDef[]; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<ContactInput>({ firstName: "", lastName: "", email: "", phone: "", title: "", companyId: "" });
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [cfValues, setCfValues] = useState<CustomFieldValueMap>({});

  function submit() {
    if (!form.firstName.trim()) return;
    startTransition(async () => {
      await createContact({ ...form, tagIds, customFields: cfValues });
      onClose();
      router.refresh();
    });
  }

  return (
    <ModalShell title="New contact" onClose={onClose}>
      <div className="space-y-3">
        <ContactFormFields form={form} setForm={setForm} companies={companies} />
        <Field label="Tags"><TagPicker all={allTags} selected={tagIds} onChange={setTagIds} /></Field>
        <CustomFieldInputs fields={customFields} values={cfValues} onChange={(id, v) => setCfValues((p) => ({ ...p, [id]: v }))} />
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <KbButton variant="outline" onClick={onClose}>Cancel</KbButton>
        <KbButton onClick={submit} disabled={pending || !form.firstName.trim()}>{pending ? "Creating..." : "Create contact"}</KbButton>
      </div>
    </ModalShell>
  );
}

function ContactDetails({ contact, companies, allTags, customFields }: { contact: ContactRow; companies: CompanyOption[]; allTags: TagRow[]; customFields: CustomFieldDef[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<ContactInput>({
    firstName: contact.firstName,
    lastName: contact.lastName ?? "",
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    title: contact.title ?? "",
    companyId: contact.companyId ?? "",
  });
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [cfValues, setCfValues] = useState<CustomFieldValueMap>({});
  const [company, setCompany] = useState<LinkedCompany | null>(null);
  const [deals, setDeals] = useState<LinkedDeal[]>([]);

  useEffect(() => {
    let active = true;
    loadContactDetail(contact.id).then((d) => {
      if (!active) return;
      setCompany(d.relations.company);
      setDeals(d.relations.deals);
      setTagIds(d.tagIds);
      setCfValues(d.customValues);
    });
    return () => { active = false; };
  }, [contact.id]);

  function save() {
    startTransition(async () => {
      await updateContact(contact.id, { ...form, tagIds, customFields: cfValues });
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <ContactFormFields form={form} setForm={setForm} companies={companies} />
      <Field label="Tags"><TagPicker all={allTags} selected={tagIds} onChange={setTagIds} /></Field>
      <CustomFieldInputs fields={customFields} values={cfValues} onChange={(id, v) => setCfValues((p) => ({ ...p, [id]: v }))} />

      <RelatedSection title="Linked company">
        {company ? <RelatedRow primary={company.name} secondary={company.industry ?? company.domain ?? ""} /> : <Empty />}
      </RelatedSection>
      <RelatedSection title="Linked deals">
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
    <input value={value} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} className="w-full rounded px-3 py-2 text-sm outline-none" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }} />
  );
}
