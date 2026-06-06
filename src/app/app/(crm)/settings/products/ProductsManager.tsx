"use client";

/*
 * Products catalog manager: list with filters (category, type, active), an
 * active toggle, create/edit modal (SKU auto-suggests from the name), bulk CSV
 * import and export, plus a link to the Categories tree manager.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Download, FolderTree, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { KbButton } from "@/components/crm/ui";
import {
  createProduct,
  updateProduct,
  toggleProductActive,
  deleteProduct,
  suggestSku,
  exportProductsCsv,
  importProductsCsv,
} from "./actions";

const TYPE_LABELS: Record<string, string> = {
  ONE_TIME: "One-time",
  RECURRING_MONTHLY: "Monthly",
  RECURRING_YEARLY: "Yearly",
  SERVICE: "Service",
};
const TYPE_OPTIONS = Object.keys(TYPE_LABELS);

export type ProductRow = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  type: string;
  unitPriceCents: number;
  currency: string;
  costCents: number | null;
  taxable: boolean;
  active: boolean;
  category: string | null;
  sortOrder: number;
};

export type CategoryOption = { id: string; name: string };

function fmtMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(cents / 100);
}

export function ProductsManager({ products, categories }: { products: ProductRow[]; categories: CategoryOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [creating, setCreating] = useState(false);

  const [fCategory, setFCategory] = useState("");
  const [fType, setFType] = useState("");
  const [fActive, setFActive] = useState("");
  const [importMsg, setImportMsg] = useState("");

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (fCategory && (p.category ?? "") !== fCategory) return false;
      if (fType && p.type !== fType) return false;
      if (fActive === "active" && !p.active) return false;
      if (fActive === "inactive" && p.active) return false;
      return true;
    });
  }, [products, fCategory, fType, fActive]);

  function onToggle(p: ProductRow) {
    startTransition(async () => {
      await toggleProductActive(p.id, !p.active);
      router.refresh();
    });
  }

  function onDelete(p: ProductRow) {
    if (!confirm(`Delete product "${p.name}" (${p.sku})?`)) return;
    startTransition(async () => {
      await deleteProduct(p.id);
      router.refresh();
    });
  }

  function onExport() {
    startTransition(async () => {
      const csv = await exportProductsCsv();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "products.csv";
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportMsg("");
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      startTransition(async () => {
        const res = await importProductsCsv(text);
        setImportMsg(`Imported: ${res.created} created, ${res.updated} updated, ${res.skipped} skipped.`);
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      });
    };
    reader.readAsText(file);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <select value={fCategory} onChange={(e) => setFCategory(e.target.value)} className="rounded px-2 py-1.5 text-sm outline-none" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
          <select value={fType} onChange={(e) => setFType(e.target.value)} className="rounded px-2 py-1.5 text-sm outline-none" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}>
            <option value="">All types</option>
            {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </select>
          <select value={fActive} onChange={(e) => setFActive(e.target.value)} className="rounded px-2 py-1.5 text-sm outline-none" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/app/settings/products/categories" className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)", color: "var(--kb-text-secondary)" }}>
            <FolderTree size={15} /> Categories
          </Link>
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onImportFile} className="hidden" />
          <KbButton variant="outline" onClick={() => fileRef.current?.click()} disabled={pending}><Upload size={15} /> Import</KbButton>
          <KbButton variant="outline" onClick={onExport} disabled={pending}><Download size={15} /> Export</KbButton>
          <KbButton onClick={() => setCreating(true)}><Plus size={16} /> New product</KbButton>
        </div>
      </div>

      {importMsg ? <div className="mb-3 text-xs" style={{ color: "var(--kb-text-secondary)" }}>{importMsg}</div> : null}

      <div style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)", boxShadow: "var(--kb-shadow-card)", overflow: "hidden" }}>
        <div className="flex items-center gap-3 px-3 py-2 text-xs font-medium" style={{ color: "var(--kb-text-secondary)", borderBottom: "1px solid var(--kb-border)" }}>
          <span style={{ width: 120 }}>SKU</span>
          <span className="flex-1">Name</span>
          <span style={{ width: 90 }}>Type</span>
          <span style={{ width: 100, textAlign: "right" }}>Price</span>
          <span style={{ width: 120 }}>Category</span>
          <span style={{ width: 70 }}>Active</span>
          <span style={{ width: 60 }} />
        </div>
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm" style={{ color: "var(--kb-text-secondary)" }}>No products match these filters.</div>
        ) : (
          filtered.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-3" style={{ borderTop: "1px solid var(--kb-border)", minHeight: "var(--kb-row-h)" }}>
              <span style={{ width: 120, fontFamily: "monospace", fontSize: 12, color: "var(--kb-text-secondary)" }}>{p.sku}</span>
              <span className="flex-1 truncate" style={{ color: "var(--kb-text-primary)", fontSize: "var(--kb-fs-body)" }}>{p.name}</span>
              <span style={{ width: 90, fontSize: 12, color: "var(--kb-text-secondary)" }}>{TYPE_LABELS[p.type] ?? p.type}</span>
              <span style={{ width: 100, textAlign: "right", color: "var(--kb-text-primary)", fontSize: "var(--kb-fs-body)" }}>{fmtMoney(p.unitPriceCents, p.currency)}</span>
              <span style={{ width: 120, fontSize: 12, color: "var(--kb-text-secondary)" }} className="truncate">{p.category ?? "-"}</span>
              <span style={{ width: 70 }}>
                <button type="button" onClick={() => onToggle(p)} disabled={pending} aria-label="Toggle active" className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors" style={{ backgroundColor: p.active ? "var(--kb-primary)" : "var(--kb-border)" }}>
                  <span className="inline-block h-4 w-4 rounded-full bg-white transition-transform" style={{ transform: p.active ? "translateX(18px)" : "translateX(2px)" }} />
                </button>
              </span>
              <span style={{ width: 60 }} className="flex items-center gap-2">
                <button type="button" onClick={() => setEditing(p)} style={{ color: "var(--kb-text-secondary)" }}><Pencil size={15} /></button>
                <button type="button" onClick={() => onDelete(p)} disabled={pending} style={{ color: "var(--kb-error)" }}><Trash2 size={15} /></button>
              </span>
            </div>
          ))
        )}
      </div>

      {creating ? <ProductModal categories={categories} onClose={() => setCreating(false)} /> : null}
      {editing ? <ProductModal product={editing} categories={categories} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function ProductModal({ product, categories, onClose }: { product?: ProductRow; categories: CategoryOption[]; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isEdit = !!product;

  const [sku, setSku] = useState(product?.sku ?? "");
  const [skuTouched, setSkuTouched] = useState(isEdit);
  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [type, setType] = useState(product?.type ?? "ONE_TIME");
  const [price, setPrice] = useState(product ? (product.unitPriceCents / 100).toFixed(2) : "");
  const [currency, setCurrency] = useState(product?.currency ?? "USD");
  const [cost, setCost] = useState(product?.costCents != null ? (product.costCents / 100).toFixed(2) : "");
  const [taxable, setTaxable] = useState(product?.taxable ?? true);
  const [active, setActive] = useState(product?.active ?? true);
  const [category, setCategory] = useState(product?.category ?? "");
  const [error, setError] = useState("");

  async function onNameBlur() {
    if (isEdit || skuTouched || !name.trim()) return;
    const suggested = await suggestSku(name);
    if (suggested) setSku(suggested);
  }

  function toCents(v: string): number {
    const n = Number(v.trim());
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  }

  function save() {
    setError("");
    if (!sku.trim()) { setError("SKU is required."); return; }
    if (!name.trim()) { setError("Product name is required."); return; }
    const payload = {
      sku: sku.trim(),
      name: name.trim(),
      description: description.trim() || null,
      type,
      unitPriceCents: toCents(price),
      currency: currency.trim() || "USD",
      costCents: cost.trim() ? toCents(cost) : null,
      taxable,
      active,
      category: category.trim() || null,
    };
    startTransition(async () => {
      try {
        if (isEdit && product) await updateProduct(product.id, payload);
        else await createProduct(payload);
        onClose();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save product.");
      }
    });
  }

  const inputStyle = { border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" } as const;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-auto p-4" style={{ backgroundColor: "rgba(0,0,0,0.35)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg p-5" style={{ backgroundColor: "var(--kb-surface)", borderRadius: "var(--kb-radius)", boxShadow: "var(--kb-shadow-modal)" }}>
        <h2 className="mb-4" style={{ fontSize: "var(--kb-fs-section)", fontWeight: 600, color: "var(--kb-text-primary)" }}>{isEdit ? "Edit product" : "New product"}</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 block">
            <span className="mb-1 block text-xs" style={{ color: "var(--kb-text-secondary)" }}>Name</span>
            <input value={name} autoFocus onChange={(e) => setName(e.target.value)} onBlur={onNameBlur} className="w-full rounded px-3 py-2 text-sm outline-none" style={inputStyle} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs" style={{ color: "var(--kb-text-secondary)" }}>SKU</span>
            <input value={sku} onChange={(e) => { setSku(e.target.value); setSkuTouched(true); }} className="w-full rounded px-3 py-2 text-sm outline-none" style={{ ...inputStyle, fontFamily: "monospace" }} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs" style={{ color: "var(--kb-text-secondary)" }}>Type</span>
            <select value={type} onChange={(e) => setType(e.target.value)} className="w-full rounded px-3 py-2 text-sm outline-none" style={inputStyle}>
              {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs" style={{ color: "var(--kb-text-secondary)" }}>Unit price</span>
            <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="0.00" className="w-full rounded px-3 py-2 text-sm outline-none" style={inputStyle} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs" style={{ color: "var(--kb-text-secondary)" }}>Currency</span>
            <input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} className="w-full rounded px-3 py-2 text-sm outline-none" style={inputStyle} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs" style={{ color: "var(--kb-text-secondary)" }}>Cost (optional)</span>
            <input value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" placeholder="0.00" className="w-full rounded px-3 py-2 text-sm outline-none" style={inputStyle} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs" style={{ color: "var(--kb-text-secondary)" }}>Category</span>
            <input value={category} onChange={(e) => setCategory(e.target.value)} list="product-categories" className="w-full rounded px-3 py-2 text-sm outline-none" style={inputStyle} />
            <datalist id="product-categories">
              {categories.map((c) => <option key={c.id} value={c.name} />)}
            </datalist>
          </label>
          <label className="col-span-2 block">
            <span className="mb-1 block text-xs" style={{ color: "var(--kb-text-secondary)" }}>Description</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full rounded px-3 py-2 text-sm outline-none" style={inputStyle} />
          </label>
          <label className="flex items-center gap-2 text-sm" style={{ color: "var(--kb-text-primary)" }}>
            <input type="checkbox" checked={taxable} onChange={(e) => setTaxable(e.target.checked)} /> Taxable
          </label>
          <label className="flex items-center gap-2 text-sm" style={{ color: "var(--kb-text-primary)" }}>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active
          </label>
        </div>
        {error ? <div className="mt-3 text-xs" style={{ color: "var(--kb-error)" }}>{error}</div> : null}
        <div className="mt-5 flex justify-end gap-2">
          <KbButton variant="outline" onClick={onClose}>Cancel</KbButton>
          <KbButton onClick={save} disabled={pending}>{pending ? "Saving..." : "Save"}</KbButton>
        </div>
      </div>
    </div>
  );
}
