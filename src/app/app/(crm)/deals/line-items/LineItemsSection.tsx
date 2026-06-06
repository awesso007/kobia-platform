"use client";

/*
 * Deal Line Items section for the Deal RecordPane Details tab. Renders a table
 * of line items with inline editing (qty, unit price, discount %, tax %), an
 * "Add product" typeahead (auto-fills name/price/tax) and "Add custom line".
 * A footer shows Subtotal / Discount / Tax / Total. Deal.amountCents recomputes
 * server-side after each change; we router.refresh() to reflect it.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { KbButton } from "@/components/crm/ui";
import {
  loadDealLineItems,
  createLineItem,
  updateLineItem,
  deleteLineItem,
  type LineItemRow,
  type ProductPick,
} from "./actions";

function fmt(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function computeTotals(items: LineItemRow[]) {
  let subtotal = 0;
  let discount = 0;
  let tax = 0;
  for (const i of items) {
    const gross = i.quantity * i.unitPriceCents;
    const disc = gross * (i.discountPct / 100);
    const net = gross - disc;
    const t = net * (i.taxRatePct / 100);
    subtotal += gross;
    discount += disc;
    tax += t;
  }
  const total = subtotal - discount + tax;
  return {
    subtotal: Math.round(subtotal),
    discount: Math.round(discount),
    tax: Math.round(tax),
    total: Math.round(total),
  };
}

export function LineItemsSection({ dealId }: { dealId: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [items, setItems] = useState<LineItemRow[]>([]);
  const [products, setProducts] = useState<ProductPick[]>([]);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    let active = true;
    loadDealLineItems(dealId).then((d) => {
      if (!active) return;
      setItems(d.items);
      setProducts(d.products);
      setLoading(false);
    });
    return () => { active = false; };
  }, [dealId]);

  function refresh() {
    loadDealLineItems(dealId).then((d) => setItems(d.items));
    router.refresh();
  }

  function addProduct(p: ProductPick) {
    setPicking(false);
    startTransition(async () => {
      await createLineItem(dealId, {
        productId: p.id,
        name: p.name,
        unitPriceCents: p.unitPriceCents,
        quantity: 1,
        taxRatePct: p.taxable ? 0 : 0,
      });
      refresh();
    });
  }

  function addCustom() {
    startTransition(async () => {
      await createLineItem(dealId, { name: "New line", unitPriceCents: 0, quantity: 1 });
      refresh();
    });
  }

  function patch(id: string, field: keyof LineItemRow, value: number | string) {
    setItems((cur) => cur.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
  }

  function commit(id: string, field: "name" | "quantity" | "unitPriceCents" | "discountPct" | "taxRatePct", value: number | string) {
    startTransition(async () => {
      await updateLineItem(id, { [field]: value } as never);
      refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      await deleteLineItem(id);
      refresh();
    });
  }

  const totals = useMemo(() => computeTotals(items), [items]);

  if (loading) return <div className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>Loading line items...</div>;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color: "var(--kb-text-secondary)" }}>Line items</span>
        <div className="relative flex items-center gap-2">
          <KbButton variant="outline" onClick={() => setPicking((v) => !v)}><Plus size={14} /> Add product</KbButton>
          <KbButton variant="ghost" onClick={addCustom}><Plus size={14} /> Custom line</KbButton>
          {picking ? <ProductPicker products={products} onPick={addProduct} onClose={() => setPicking(false)} /> : null}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded p-4 text-center text-xs" style={{ border: "1px dashed var(--kb-border)", borderRadius: "var(--kb-radius-sm)", color: "var(--kb-text-secondary)" }}>
          No line items yet. Add a product or a custom line.
        </div>
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
                <th className="px-2 py-1.5 text-right font-medium" style={{ width: 80 }}>Total</th>
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
                    <td className="px-2 py-1">
                      <input value={i.name} onChange={(e) => patch(i.id, "name", e.target.value)} onBlur={(e) => commit(i.id, "name", e.target.value)} className="w-full bg-transparent outline-none" style={{ color: "var(--kb-text-primary)" }} />
                    </td>
                    <td className="px-1 py-1">
                      <input value={i.quantity} onChange={(e) => patch(i.id, "quantity", Number(e.target.value) || 0)} onBlur={(e) => commit(i.id, "quantity", Number(e.target.value) || 0)} inputMode="decimal" className="w-full bg-transparent text-right outline-none" />
                    </td>
                    <td className="px-1 py-1">
                      <input value={(i.unitPriceCents / 100).toFixed(2)} onChange={(e) => patch(i.id, "unitPriceCents", Math.round((Number(e.target.value) || 0) * 100))} onBlur={(e) => commit(i.id, "unitPriceCents", Math.round((Number(e.target.value) || 0) * 100))} inputMode="decimal" className="w-full bg-transparent text-right outline-none" />
                    </td>
                    <td className="px-1 py-1">
                      <input value={i.discountPct} onChange={(e) => patch(i.id, "discountPct", Number(e.target.value) || 0)} onBlur={(e) => commit(i.id, "discountPct", Number(e.target.value) || 0)} inputMode="decimal" className="w-full bg-transparent text-right outline-none" />
                    </td>
                    <td className="px-1 py-1">
                      <input value={i.taxRatePct} onChange={(e) => patch(i.id, "taxRatePct", Number(e.target.value) || 0)} onBlur={(e) => commit(i.id, "taxRatePct", Number(e.target.value) || 0)} inputMode="decimal" className="w-full bg-transparent text-right outline-none" />
                    </td>
                    <td className="px-2 py-1 text-right" style={{ color: "var(--kb-text-primary)", fontWeight: 500 }}>{fmt(lineTotal)}</td>
                    <td className="px-1 py-1 text-right">
                      <button type="button" onClick={() => remove(i.id)} style={{ color: "var(--kb-error)" }}><Trash2 size={13} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="space-y-1 px-2 py-2 text-xs" style={{ backgroundColor: "var(--kb-surface-grey)" }}>
            <FooterRow label="Subtotal" value={fmt(totals.subtotal)} />
            <FooterRow label="Discount" value={`-${fmt(totals.discount)}`} />
            <FooterRow label="Tax" value={fmt(totals.tax)} />
            <FooterRow label="Total" value={fmt(totals.total)} strong />
          </div>
        </div>
      )}
    </div>
  );
}

function FooterRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between">
      <span style={{ color: "var(--kb-text-secondary)" }}>{label}</span>
      <span style={{ color: "var(--kb-text-primary)", fontWeight: strong ? 600 : 400 }}>{value}</span>
    </div>
  );
}

function ProductPicker({ products, onPick, onClose }: { products: ProductPick[]; onPick: (p: ProductPick) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
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
          <div className="px-3 py-3 text-xs" style={{ color: "var(--kb-text-secondary)" }}>No active products found.</div>
        ) : (
          filtered.map((p) => (
            <button key={p.id} type="button" onClick={() => onPick(p)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--kb-surface-grey)]">
              <span className="min-w-0">
                <span className="block truncate" style={{ color: "var(--kb-text-primary)" }}>{p.name}</span>
                <span className="block truncate text-xs" style={{ color: "var(--kb-text-secondary)", fontFamily: "monospace" }}>{p.sku}</span>
              </span>
              <span style={{ color: "var(--kb-text-secondary)" }}>{fmt(p.unitPriceCents)}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
