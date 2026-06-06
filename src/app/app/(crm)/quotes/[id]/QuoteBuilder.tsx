"use client";

/*
 * Quote builder (Sprint 10). Edit title, status, Contact/Company/Deal pickers,
 * template, an inline line-items editor (populated from the linked Deal), Notes
 * + Terms, then Save / Send to customer / Download PDF / Convert to deal.
 * Totals (subtotal/discount/tax/total) recompute server-side after each line
 * mutation; we router.refresh() to reflect new values.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Send, Trash2, FileText } from "lucide-react";
import { KbButton, StatusBadge } from "@/components/crm/ui";
import type { QuoteBuilderData } from "../queries";
import {
  updateQuote,
  createQuoteLine,
  updateQuoteLine,
  deleteQuoteLine,
  sendQuote,
  convertQuoteToDeal,
} from "../actions";

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(cents / 100);
}

export function QuoteBuilder({ data }: { data: QuoteBuilderData }) {
  const router = useRouter();
  const { quote, contacts, companies, deals, templates, products } = data;
  const [, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState(quote.title);
  const [status, setStatus] = useState(quote.status);
  const [dealId, setDealId] = useState(quote.dealId ?? "");
  const [contactId, setContactId] = useState(quote.contactId ?? "");
  const [companyId, setCompanyId] = useState(quote.companyId ?? "");
  const [templateId, setTemplateId] = useState(quote.templateId ?? "");
  const [notes, setNotes] = useState(quote.notes ?? "");
  const [terms, setTerms] = useState(quote.termsAndConditions ?? "");
  const [expiresAt, setExpiresAt] = useState(quote.expiresAt ?? "");
  const [items, setItems] = useState(quote.lineItems);
  const [picking, setPicking] = useState(false);

  useEffect(() => { setItems(quote.lineItems); }, [quote.lineItems]);

  function save() {
    setSaving(true);
    startTransition(async () => {
      await updateQuote(quote.id, {
        title, status, dealId: dealId || null, contactId: contactId || null,
        companyId: companyId || null, templateId: templateId || null,
        notes: notes || null, termsAndConditions: terms || null,
        expiresAt: expiresAt || null,
      });
      setSaving(false);
      router.refresh();
    });
  }

  function addProduct(p: { id: string; name: string; unitPriceCents: number; taxable: boolean }) {
    setPicking(false);
    startTransition(async () => {
      await createQuoteLine(quote.id, { productId: p.id, name: p.name, unitPriceCents: p.unitPriceCents, quantity: 1 });
      router.refresh();
    });
  }

  function addCustom() {
    startTransition(async () => {
      await createQuoteLine(quote.id, { name: "New line", unitPriceCents: 0, quantity: 1 });
      router.refresh();
    });
  }

  function patch(id: string, field: string, value: number | string) {
    setItems((cur) => cur.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
  }

  function commit(id: string, field: "name" | "quantity" | "unitPriceCents" | "discountPct" | "taxRatePct", value: number | string) {
    startTransition(async () => {
      await updateQuoteLine(id, { [field]: value } as never);
      router.refresh();
    });
  }

  function removeLine(id: string) {
    startTransition(async () => {
      await deleteQuoteLine(id);
      router.refresh();
    });
  }

  function send() {
    if (!confirm("Send this quote to the customer? A PDF will be generated and the status set to SENT.")) return;
    startTransition(async () => {
      await sendQuote(quote.id);
      router.refresh();
    });
  }

  function convert() {
    startTransition(async () => {
      const id = await convertQuoteToDeal(quote.id);
      router.push(`/app/deals`);
      void id;
    });
  }

  const totals = useMemo(() => {
    let subtotal = 0, discount = 0, tax = 0;
    for (const i of items) {
      const gross = i.quantity * i.unitPriceCents;
      const disc = gross * (i.discountPct / 100);
      const net = gross - disc;
      subtotal += gross; discount += disc; tax += net * (i.taxRatePct / 100);
    }
    return { subtotal: Math.round(subtotal), discount: Math.round(discount), tax: Math.round(tax), total: Math.round(subtotal - discount + tax) };
  }, [items]);

  const inputStyle = { border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" } as const;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/app/quotes" className="mb-1 inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--kb-text-secondary)" }}><ArrowLeft size={14} /> Quotes</Link>
          <div className="flex items-center gap-3">
            <h1 style={{ fontSize: "var(--kb-fs-h1)", fontWeight: 600, color: "var(--kb-text-primary)" }}>{quote.number}</h1>
            <StatusBadge value={status} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={`/api/quotes/${quote.id}/pdf`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)", color: "var(--kb-text-secondary)" }}><FileText size={15} /> PDF</a>
          {!quote.dealId ? <KbButton variant="outline" onClick={convert}>Convert to deal</KbButton> : null}
          <KbButton variant="outline" onClick={send}><Send size={15} /> Send to customer</KbButton>
          <KbButton onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</KbButton>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2 space-y-4">
          <div className="space-y-3 p-4" style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)" }}>
            <label className="block">
              <span className="mb-1 block text-xs" style={{ color: "var(--kb-text-secondary)" }}>Title</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded px-3 py-2 text-sm outline-none" style={inputStyle} />
            </label>

            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium" style={{ color: "var(--kb-text-secondary)" }}>Line items</span>
              <div className="relative flex items-center gap-2">
                <KbButton variant="outline" onClick={() => setPicking((v) => !v)}><Plus size={14} /> Add product</KbButton>
                <KbButton variant="ghost" onClick={addCustom}><Plus size={14} /> Custom line</KbButton>
                {picking ? <ProductPicker products={products} onPick={addProduct} onClose={() => setPicking(false)} /> : null}
              </div>
            </div>

            {items.length === 0 ? (
              <div className="rounded p-4 text-center text-xs" style={{ border: "1px dashed var(--kb-border)", borderRadius: "var(--kb-radius-sm)", color: "var(--kb-text-secondary)" }}>No line items yet.</div>
            ) : (
              <div style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)", overflow: "hidden" }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ color: "var(--kb-text-secondary)", borderBottom: "1px solid var(--kb-border)" }}>
                      <th className="px-2 py-1.5 text-left font-medium">Item</th>
                      <th className="px-1 py-1.5 text-right font-medium" style={{ width: 44 }}>Qty</th>
                      <th className="px-1 py-1.5 text-right font-medium" style={{ width: 80 }}>Price</th>
                      <th className="px-1 py-1.5 text-right font-medium" style={{ width: 50 }}>Disc%</th>
                      <th className="px-1 py-1.5 text-right font-medium" style={{ width: 50 }}>Tax%</th>
                      <th className="px-2 py-1.5 text-right font-medium" style={{ width: 90 }}>Total</th>
                      <th style={{ width: 28 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((i) => {
                      const gross = i.quantity * i.unitPriceCents;
                      const net = gross - gross * (i.discountPct / 100);
                      const lineTotal = Math.round(net + net * (i.taxRatePct / 100));
                      return (
                        <tr key={i.id} style={{ borderBottom: "1px solid var(--kb-border)" }}>
                          <td className="px-2 py-1"><input value={i.name} onChange={(e) => patch(i.id, "name", e.target.value)} onBlur={(e) => commit(i.id, "name", e.target.value)} className="w-full bg-transparent outline-none" style={{ color: "var(--kb-text-primary)" }} /></td>
                          <td className="px-1 py-1"><input value={i.quantity} onChange={(e) => patch(i.id, "quantity", Number(e.target.value) || 0)} onBlur={(e) => commit(i.id, "quantity", Number(e.target.value) || 0)} inputMode="decimal" className="w-full bg-transparent text-right outline-none" /></td>
                          <td className="px-1 py-1"><input value={(i.unitPriceCents / 100).toFixed(2)} onChange={(e) => patch(i.id, "unitPriceCents", Math.round((Number(e.target.value) || 0) * 100))} onBlur={(e) => commit(i.id, "unitPriceCents", Math.round((Number(e.target.value) || 0) * 100))} inputMode="decimal" className="w-full bg-transparent text-right outline-none" /></td>
                          <td className="px-1 py-1"><input value={i.discountPct} onChange={(e) => patch(i.id, "discountPct", Number(e.target.value) || 0)} onBlur={(e) => commit(i.id, "discountPct", Number(e.target.value) || 0)} inputMode="decimal" className="w-full bg-transparent text-right outline-none" /></td>
                          <td className="px-1 py-1"><input value={i.taxRatePct} onChange={(e) => patch(i.id, "taxRatePct", Number(e.target.value) || 0)} onBlur={(e) => commit(i.id, "taxRatePct", Number(e.target.value) || 0)} inputMode="decimal" className="w-full bg-transparent text-right outline-none" /></td>
                          <td className="px-2 py-1 text-right" style={{ color: "var(--kb-text-primary)", fontWeight: 500 }}>{money(lineTotal, quote.currency)}</td>
                          <td className="px-1 py-1 text-right"><button type="button" onClick={() => removeLine(i.id)} style={{ color: "var(--kb-error)" }}><Trash2 size={13} /></button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="space-y-1 px-3 py-2 text-xs" style={{ backgroundColor: "var(--kb-surface-grey)" }}>
                  <Foot label="Subtotal" value={money(totals.subtotal, quote.currency)} />
                  <Foot label="Discount" value={`-${money(totals.discount, quote.currency)}`} />
                  <Foot label="Tax" value={money(totals.tax, quote.currency)} />
                  <Foot label="Total" value={money(totals.total, quote.currency)} strong />
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-3 p-4 sm:grid-cols-2" style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)" }}>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs" style={{ color: "var(--kb-text-secondary)" }}>Notes</span>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full rounded px-3 py-2 text-sm outline-none" style={inputStyle} />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs" style={{ color: "var(--kb-text-secondary)" }}>Terms and conditions</span>
              <textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={3} className="w-full rounded px-3 py-2 text-sm outline-none" style={inputStyle} />
            </label>
          </div>
        </div>

        <div className="space-y-3 p-4" style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)", height: "fit-content" }}>
          <Select label="Status" value={status} onChange={setStatus} options={["DRAFT", "SENT", "VIEWED", "ACCEPTED", "DECLINED", "EXPIRED"].map((s) => ({ value: s, label: s }))} />
          <Select label="Contact" value={contactId} onChange={setContactId} options={[{ value: "", label: "None" }, ...contacts.map((c) => ({ value: c.id, label: c.label }))]} />
          <Select label="Company" value={companyId} onChange={setCompanyId} options={[{ value: "", label: "None" }, ...companies.map((c) => ({ value: c.id, label: c.name }))]} />
          <Select label="Deal" value={dealId} onChange={setDealId} options={[{ value: "", label: "None" }, ...deals.map((d) => ({ value: d.id, label: d.name }))]} />
          <Select label="Template" value={templateId} onChange={setTemplateId} options={[{ value: "", label: "Default" }, ...templates.map((t) => ({ value: t.id, label: t.name }))]} />
          <label className="block">
            <span className="mb-1 block text-xs" style={{ color: "var(--kb-text-secondary)" }}>Expires</span>
            <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="w-full rounded px-3 py-2 text-sm outline-none" style={inputStyle} />
          </label>
          <div className="pt-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>
            Public link: <Link href={`/quote/${quote.publicSlug}`} target="_blank" style={{ color: "var(--kb-primary)" }}>/quote/{quote.publicSlug.slice(0, 8)}...</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Foot({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between">
      <span style={{ color: "var(--kb-text-secondary)" }}>{label}</span>
      <span style={{ color: "var(--kb-text-primary)", fontWeight: strong ? 600 : 400 }}>{value}</span>
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs" style={{ color: "var(--kb-text-secondary)" }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded px-3 py-2 text-sm outline-none" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

function ProductPicker({ products, onPick, onClose }: { products: { id: string; sku: string; name: string; unitPriceCents: number; taxable: boolean }[]; onPick: (p: { id: string; name: string; unitPriceCents: number; taxable: boolean }) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [onClose]);
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return products.slice(0, 50);
    return products.filter((p) => p.name.toLowerCase().includes(t) || p.sku.toLowerCase().includes(t)).slice(0, 50);
  }, [q, products]);
  return (
    <div ref={ref} className="absolute right-0 top-full z-50 mt-1 w-72" style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)", boxShadow: "var(--kb-shadow-modal)" }}>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products..." className="w-full border-0 px-3 py-2 text-sm outline-none" style={{ borderBottom: "1px solid var(--kb-border)" }} />
      <div className="max-h-64 overflow-auto">
        {filtered.length === 0 ? (
          <div className="px-3 py-3 text-xs" style={{ color: "var(--kb-text-secondary)" }}>No active products.</div>
        ) : filtered.map((p) => (
          <button key={p.id} type="button" onClick={() => onPick(p)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--kb-surface-grey)]">
            <span className="min-w-0"><span className="block truncate" style={{ color: "var(--kb-text-primary)" }}>{p.name}</span><span className="block truncate text-xs" style={{ color: "var(--kb-text-secondary)", fontFamily: "monospace" }}>{p.sku}</span></span>
            <span style={{ color: "var(--kb-text-secondary)" }}>{money(p.unitPriceCents, "USD")}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
