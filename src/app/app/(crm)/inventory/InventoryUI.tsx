"use client";

/*
 * Client components for the Inventory / Warehouse admin module (Sprint 20).
 * Layout primitives shared across all inventory pages plus the interactive
 * forms and action buttons. Pure formatters are imported from
 * lib/inventory/inventory-utils; page navigation config from inventory-ui-utils.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { statusColor, stockLevel, stockLevelColor } from "@/lib/inventory/inventory-utils";
import { INVENTORY_TABS, MOVEMENT_TYPE_OPTIONS } from "./inventory-ui-utils";

type ReactChildren = { children: React.ReactNode };
type Option = { id: string; name: string };
type ProductOption = { id: string; name: string; sku: string | null; costCents: number | null };
type WarehouseOption = { id: string; name: string; code: string };

const inputStyle = { border: "1px solid var(--kb-border)", backgroundColor: "var(--kb-bg)", borderRadius: "var(--kb-radius-sm)" };

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between">
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: "var(--kb-text-primary)" }}>
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-sm" style={{ color: "var(--kb-text-secondary)" }}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function Subnav() {
  const pathname = usePathname();
  return (
    <div className="mb-6 flex flex-wrap gap-1 border-b" style={{ borderColor: "var(--kb-border)" }}>
      {INVENTORY_TABS.map((t) => {
        const active = t.href === "/app/inventory" ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.key}
            href={t.href}
            className="px-3 py-2 text-sm font-medium"
            style={{
              color: active ? "var(--kb-primary)" : "var(--kb-text-secondary)",
              borderBottom: active ? "2px solid var(--kb-primary)" : "2px solid transparent",
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

export function Card({ children }: ReactChildren) {
  return (
    <div style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)" }}>{children}</div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="p-8 text-center text-sm" style={{ color: "var(--kb-text-secondary)" }}>
      {message}
    </div>
  );
}

export function Th({ children }: ReactChildren) {
  return (
    <th className="px-3 py-2 text-left text-xs font-medium uppercase" style={{ color: "var(--kb-text-secondary)" }}>
      {children}
    </th>
  );
}

export function Td({ children }: ReactChildren) {
  return (
    <td className="px-3 py-2 align-top" style={{ color: "var(--kb-text-primary)" }}>
      {children}
    </td>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const color = statusColor(status);
  return (
    <span className="inline-flex rounded px-1.5 py-0.5 text-xs font-medium" style={{ color, backgroundColor: `${color}1a`, borderRadius: "var(--kb-radius-sm)" }}>
      {status}
    </span>
  );
}

export function StockBadge({ quantity, threshold }: { quantity: number; threshold: number }) {
  const level = stockLevel(quantity, threshold);
  const color = stockLevelColor(level);
  const label = level === "out" ? "Out" : level === "low" ? "Low" : "OK";
  return (
    <span className="inline-flex rounded px-1.5 py-0.5 text-xs font-medium" style={{ color, backgroundColor: `${color}1a`, borderRadius: "var(--kb-radius-sm)" }}>
      {label}
    </span>
  );
}

export function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="p-4" style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)" }}>
      <div className="text-xs font-medium uppercase" style={{ color: "var(--kb-text-secondary)" }}>
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold" style={{ color: "var(--kb-text-primary)" }}>
        {value}
      </div>
    </div>
  );
}

function PrimaryButton({ children, disabled, onClick, type = "button" }: { children: React.ReactNode; disabled?: boolean; onClick?: () => void; type?: "button" | "submit" }) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className="rounded px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      style={{ backgroundColor: "var(--kb-primary)", borderRadius: "var(--kb-radius-sm)" }}
    >
      {children}
    </button>
  );
}

function ErrorText({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className="text-sm" style={{ color: "#dc2626" }}>
      {error}
    </p>
  );
}

function Field({ label, children }: { label: string } & ReactChildren) {
  return (
    <div>
      <label className="block text-sm font-medium" style={{ color: "var(--kb-text-primary)" }}>
        {label}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

/* -------------------------------- Warehouses ------------------------------- */

type WarehouseValues = {
  name: string;
  code: string;
  address: string;
  city: string;
  region: string;
  country: string;
  isDefault: boolean;
  active: boolean;
};

export function WarehouseForm({ id, initial }: { id?: string; initial?: Partial<WarehouseValues> }) {
  const router = useRouter();
  const [v, setV] = useState<WarehouseValues>({
    name: initial?.name ?? "",
    code: initial?.code ?? "",
    address: initial?.address ?? "",
    city: initial?.city ?? "",
    region: initial?.region ?? "",
    country: initial?.country ?? "",
    isDefault: initial?.isDefault ?? false,
    active: initial?.active ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await fetch(id ? `/api/inventory/warehouses/${id}` : "/api/inventory/warehouses", {
        method: id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error || "Failed");
        return;
      }
      router.push(id ? `/app/inventory/warehouses/${id}` : `/app/inventory/warehouses/${data.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4 p-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Name">
          <input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required className="w-full px-3 py-2 text-sm" style={inputStyle} />
        </Field>
        <Field label="Code">
          <input value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} required className="w-full px-3 py-2 text-sm" style={inputStyle} />
        </Field>
      </div>
      <Field label="Address">
        <input value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} className="w-full px-3 py-2 text-sm" style={inputStyle} />
      </Field>
      <div className="grid grid-cols-3 gap-4">
        <Field label="City">
          <input value={v.city} onChange={(e) => setV({ ...v, city: e.target.value })} className="w-full px-3 py-2 text-sm" style={inputStyle} />
        </Field>
        <Field label="Region">
          <input value={v.region} onChange={(e) => setV({ ...v, region: e.target.value })} className="w-full px-3 py-2 text-sm" style={inputStyle} />
        </Field>
        <Field label="Country">
          <input value={v.country} onChange={(e) => setV({ ...v, country: e.target.value })} className="w-full px-3 py-2 text-sm" style={inputStyle} />
        </Field>
      </div>
      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--kb-text-primary)" }}>
          <input type="checkbox" checked={v.isDefault} onChange={(e) => setV({ ...v, isDefault: e.target.checked })} /> Default warehouse
        </label>
        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--kb-text-primary)" }}>
          <input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} /> Active
        </label>
      </div>
      <ErrorText error={error} />
      <div className="flex justify-end gap-2">
        <Link href="/app/inventory/warehouses" className="rounded px-3 py-1.5 text-sm" style={{ border: "1px solid var(--kb-border)" }}>
          Cancel
        </Link>
        <PrimaryButton type="submit" disabled={isPending}>
          {isPending ? "Saving..." : id ? "Save" : "Create"}
        </PrimaryButton>
      </div>
    </form>
  );
}

/* --------------------------------- Vendors --------------------------------- */

type VendorValues = {
  name: string;
  email: string;
  phone: string;
  contactName: string;
  city: string;
  paymentTerms: string;
  notes: string;
  active: boolean;
};

export function VendorForm({ id, initial }: { id?: string; initial?: Partial<VendorValues> }) {
  const router = useRouter();
  const [v, setV] = useState<VendorValues>({
    name: initial?.name ?? "",
    email: initial?.email ?? "",
    phone: initial?.phone ?? "",
    contactName: initial?.contactName ?? "",
    city: initial?.city ?? "",
    paymentTerms: initial?.paymentTerms ?? "",
    notes: initial?.notes ?? "",
    active: initial?.active ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await fetch(id ? `/api/inventory/vendors/${id}` : "/api/inventory/vendors", {
        method: id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error || "Failed");
        return;
      }
      router.push(id ? `/app/inventory/vendors/${id}` : `/app/inventory/vendors/${data.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4 p-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Name">
          <input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required className="w-full px-3 py-2 text-sm" style={inputStyle} />
        </Field>
        <Field label="Contact name">
          <input value={v.contactName} onChange={(e) => setV({ ...v, contactName: e.target.value })} className="w-full px-3 py-2 text-sm" style={inputStyle} />
        </Field>
        <Field label="Email">
          <input value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} className="w-full px-3 py-2 text-sm" style={inputStyle} />
        </Field>
        <Field label="Phone">
          <input value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} className="w-full px-3 py-2 text-sm" style={inputStyle} />
        </Field>
        <Field label="City">
          <input value={v.city} onChange={(e) => setV({ ...v, city: e.target.value })} className="w-full px-3 py-2 text-sm" style={inputStyle} />
        </Field>
        <Field label="Payment terms">
          <input value={v.paymentTerms} onChange={(e) => setV({ ...v, paymentTerms: e.target.value })} className="w-full px-3 py-2 text-sm" style={inputStyle} />
        </Field>
      </div>
      <Field label="Notes">
        <textarea value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} rows={2} className="w-full px-3 py-2 text-sm" style={inputStyle} />
      </Field>
      <label className="flex items-center gap-2 text-sm" style={{ color: "var(--kb-text-primary)" }}>
        <input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} /> Active
      </label>
      <ErrorText error={error} />
      <div className="flex justify-end gap-2">
        <Link href="/app/inventory/vendors" className="rounded px-3 py-1.5 text-sm" style={{ border: "1px solid var(--kb-border)" }}>
          Cancel
        </Link>
        <PrimaryButton type="submit" disabled={isPending}>
          {isPending ? "Saving..." : id ? "Save" : "Create"}
        </PrimaryButton>
      </div>
    </form>
  );
}

/* ---------------------------- Adjust stock modal --------------------------- */

export function AdjustStockButton({ products, warehouses }: { products: ProductOption[]; warehouses: WarehouseOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await fetch("/api/inventory/stock/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, warehouseId, delta: Number(delta), note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error || "Failed");
        return;
      }
      setOpen(false);
      setProductId("");
      setWarehouseId("");
      setDelta("");
      setNote("");
      router.refresh();
    });
  }

  return (
    <>
      <PrimaryButton onClick={() => setOpen(true)}>Adjust stock</PrimaryButton>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.4)" }} onClick={() => setOpen(false)}>
          <div className="w-full max-w-md" style={{ backgroundColor: "var(--kb-surface)", borderRadius: "var(--kb-radius)" }} onClick={(e) => e.stopPropagation()}>
            <form onSubmit={submit} className="space-y-4 p-5">
              <h2 className="text-lg font-semibold" style={{ color: "var(--kb-text-primary)" }}>
                Adjust stock
              </h2>
              <Field label="Product">
                <select value={productId} onChange={(e) => setProductId(e.target.value)} required className="w-full px-3 py-2 text-sm" style={inputStyle}>
                  <option value="">Select a product</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.sku ? ` (${p.sku})` : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Warehouse">
                <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} required className="w-full px-3 py-2 text-sm" style={inputStyle}>
                  <option value="">Select a warehouse</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.code})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Delta (positive to add, negative to remove)">
                <input value={delta} onChange={(e) => setDelta(e.target.value)} type="number" step={1} required className="w-full px-3 py-2 text-sm" style={inputStyle} />
              </Field>
              <Field label="Note">
                <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full px-3 py-2 text-sm" style={inputStyle} />
              </Field>
              <ErrorText error={error} />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded px-3 py-1.5 text-sm" style={{ border: "1px solid var(--kb-border)" }}>
                  Cancel
                </button>
                <PrimaryButton type="submit" disabled={isPending}>
                  {isPending ? "Saving..." : "Apply"}
                </PrimaryButton>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

/* ------------------------------ Filter controls ---------------------------- */

export function StockFilters({ warehouses, search, warehouseId }: { warehouses: WarehouseOption[]; search?: string; warehouseId?: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  function setParam(key: string, value: string) {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`/app/inventory/stock?${next.toString()}`);
  }
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      <input
        defaultValue={search ?? ""}
        placeholder="Search product or SKU"
        onKeyDown={(e) => {
          if (e.key === "Enter") setParam("search", (e.target as HTMLInputElement).value);
        }}
        className="px-3 py-1.5 text-sm"
        style={inputStyle}
      />
      <select value={warehouseId ?? ""} onChange={(e) => setParam("warehouseId", e.target.value)} className="px-3 py-1.5 text-sm" style={inputStyle}>
        <option value="">All warehouses</option>
        {warehouses.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export function MovementFilters({ type, warehouseId, warehouses }: { type?: string; warehouseId?: string; warehouses: WarehouseOption[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  function setParam(key: string, value: string) {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    router.push(`/app/inventory/movements?${next.toString()}`);
  }
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      <select value={type ?? ""} onChange={(e) => setParam("type", e.target.value)} className="px-3 py-1.5 text-sm" style={inputStyle}>
        <option value="">All types</option>
        {MOVEMENT_TYPE_OPTIONS.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <select value={warehouseId ?? ""} onChange={(e) => setParam("warehouseId", e.target.value)} className="px-3 py-1.5 text-sm" style={inputStyle}>
        <option value="">All warehouses</option>
        {warehouses.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Pagination({ base, page, pageSize, total }: { base: string; page: number; pageSize: number; total: number }) {
  const sp = useSearchParams();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  function href(p: number) {
    const next = new URLSearchParams(sp.toString());
    next.set("page", String(p));
    return `${base}?${next.toString()}`;
  }
  return (
    <div className="flex items-center justify-between p-3 text-sm" style={{ color: "var(--kb-text-secondary)" }}>
      <span>
        Page {page} of {pages} ({total} total)
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className="rounded px-2 py-1" style={{ border: "1px solid var(--kb-border)" }}>
            Previous
          </Link>
        ) : null}
        {page < pages ? (
          <Link href={href(page + 1)} className="rounded px-2 py-1" style={{ border: "1px solid var(--kb-border)" }}>
            Next
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------- Transfers -------------------------------- */

type Line = { productId: string; quantity: string };

export function TransferForm({ products, warehouses }: { products: ProductOption[]; warehouses: WarehouseOption[] }) {
  const router = useRouter();
  const [fromWarehouseId, setFrom] = useState("");
  const [toWarehouseId, setTo] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([{ productId: "", quantity: "1" }]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  function setLine(idx: number, patch: Partial<Line>) {
    setLines(lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const items = lines.filter((l) => l.productId && Number(l.quantity) > 0).map((l) => ({ productId: l.productId, quantity: Number(l.quantity) }));
    start(async () => {
      const res = await fetch("/api/inventory/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromWarehouseId, toWarehouseId, notes, items }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error || "Failed");
        return;
      }
      router.push(`/app/inventory/transfers/${data.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4 p-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="From warehouse">
          <select value={fromWarehouseId} onChange={(e) => setFrom(e.target.value)} required className="w-full px-3 py-2 text-sm" style={inputStyle}>
            <option value="">Select</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="To warehouse">
          <select value={toWarehouseId} onChange={(e) => setTo(e.target.value)} required className="w-full px-3 py-2 text-sm" style={inputStyle}>
            <option value="">Select</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div>
        <div className="mb-2 text-sm font-medium" style={{ color: "var(--kb-text-primary)" }}>
          Line items
        </div>
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="flex gap-2">
              <select value={l.productId} onChange={(e) => setLine(i, { productId: e.target.value })} className="flex-1 px-3 py-2 text-sm" style={inputStyle}>
                <option value="">Select product</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.sku ? ` (${p.sku})` : ""}
                  </option>
                ))}
              </select>
              <input value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} type="number" min={1} className="w-24 px-3 py-2 text-sm" style={inputStyle} />
              <button type="button" onClick={() => setLines(lines.filter((_, idx) => idx !== i))} className="rounded px-2 text-sm" style={{ border: "1px solid var(--kb-border)" }}>
                Remove
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setLines([...lines, { productId: "", quantity: "1" }])} className="mt-2 rounded px-3 py-1.5 text-sm" style={{ border: "1px solid var(--kb-border)" }}>
          Add line
        </button>
      </div>
      <Field label="Notes">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 text-sm" style={inputStyle} />
      </Field>
      <ErrorText error={error} />
      <div className="flex justify-end gap-2">
        <Link href="/app/inventory/transfers" className="rounded px-3 py-1.5 text-sm" style={{ border: "1px solid var(--kb-border)" }}>
          Cancel
        </Link>
        <PrimaryButton type="submit" disabled={isPending}>
          {isPending ? "Creating..." : "Create transfer"}
        </PrimaryButton>
      </div>
    </form>
  );
}

export function TransferActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  function act(action: "send" | "receive") {
    setError(null);
    start(async () => {
      const res = await fetch(`/api/inventory/transfers/${id}/${action}`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error || "Failed");
        return;
      }
      router.refresh();
    });
  }

  const canSend = status === "DRAFT" || status === "PENDING";
  const canReceive = status === "IN_TRANSIT";
  return (
    <div className="flex items-center gap-2">
      {canSend ? <PrimaryButton disabled={isPending} onClick={() => act("send")}>{isPending ? "Working..." : "Send"}</PrimaryButton> : null}
      {canReceive ? <PrimaryButton disabled={isPending} onClick={() => act("receive")}>{isPending ? "Working..." : "Receive"}</PrimaryButton> : null}
      <ErrorText error={error} />
    </div>
  );
}

/* ----------------------------- Purchase orders ----------------------------- */

type PoLine = { productId: string; quantity: string; unitCostCents: string };

export function PurchaseOrderForm({ products, warehouses, vendors }: { products: ProductOption[]; warehouses: WarehouseOption[]; vendors: Option[] }) {
  const router = useRouter();
  const [vendorId, setVendorId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<PoLine[]>([{ productId: "", quantity: "1", unitCostCents: "0" }]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  function setLine(idx: number, patch: Partial<PoLine>) {
    setLines(lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function onProduct(idx: number, productId: string) {
    const p = products.find((x) => x.id === productId);
    setLine(idx, { productId, unitCostCents: p?.costCents != null ? String(p.costCents) : lines[idx]?.unitCostCents ?? "0" });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const items = lines
      .filter((l) => l.productId && Number(l.quantity) > 0)
      .map((l) => ({ productId: l.productId, quantity: Number(l.quantity), unitCostCents: Number(l.unitCostCents) }));
    start(async () => {
      const res = await fetch("/api/inventory/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorId, warehouseId, expectedDate: expectedDate || null, notes, items }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error || "Failed");
        return;
      }
      router.push(`/app/inventory/purchase-orders/${data.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4 p-4">
      <div className="grid grid-cols-3 gap-4">
        <Field label="Vendor">
          <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} required className="w-full px-3 py-2 text-sm" style={inputStyle}>
            <option value="">Select</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Warehouse">
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} required className="w-full px-3 py-2 text-sm" style={inputStyle}>
            <option value="">Select</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Expected date">
          <input value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} type="date" className="w-full px-3 py-2 text-sm" style={inputStyle} />
        </Field>
      </div>
      <div>
        <div className="mb-2 text-sm font-medium" style={{ color: "var(--kb-text-primary)" }}>
          Line items
        </div>
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="flex gap-2">
              <select value={l.productId} onChange={(e) => onProduct(i, e.target.value)} className="flex-1 px-3 py-2 text-sm" style={inputStyle}>
                <option value="">Select product</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.sku ? ` (${p.sku})` : ""}
                  </option>
                ))}
              </select>
              <input value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} type="number" min={1} placeholder="Qty" className="w-20 px-3 py-2 text-sm" style={inputStyle} />
              <input value={l.unitCostCents} onChange={(e) => setLine(i, { unitCostCents: e.target.value })} type="number" min={0} placeholder="Unit cost (cents)" className="w-40 px-3 py-2 text-sm" style={inputStyle} />
              <button type="button" onClick={() => setLines(lines.filter((_, idx) => idx !== i))} className="rounded px-2 text-sm" style={{ border: "1px solid var(--kb-border)" }}>
                Remove
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setLines([...lines, { productId: "", quantity: "1", unitCostCents: "0" }])} className="mt-2 rounded px-3 py-1.5 text-sm" style={{ border: "1px solid var(--kb-border)" }}>
          Add line
        </button>
      </div>
      <Field label="Notes">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 text-sm" style={inputStyle} />
      </Field>
      <ErrorText error={error} />
      <div className="flex justify-end gap-2">
        <Link href="/app/inventory/purchase-orders" className="rounded px-3 py-1.5 text-sm" style={{ border: "1px solid var(--kb-border)" }}>
          Cancel
        </Link>
        <PrimaryButton type="submit" disabled={isPending}>
          {isPending ? "Creating..." : "Create PO"}
        </PrimaryButton>
      </div>
    </form>
  );
}

type ReceiveLine = { id: string; productName: string; quantity: number; receivedQuantity: number };

export function PurchaseOrderActions({ id, status, items }: { id: string; status: string; items: ReceiveLine[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();
  const [receiving, setReceiving] = useState(false);
  const [qty, setQty] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((i) => [i.id, String(Math.max(0, i.quantity - i.receivedQuantity))])),
  );

  function send() {
    setError(null);
    start(async () => {
      const res = await fetch(`/api/inventory/purchase-orders/${id}/send`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error || "Failed");
        return;
      }
      router.refresh();
    });
  }

  function receive() {
    setError(null);
    const lines = items.map((i) => ({ itemId: i.id, receivedQuantity: Number(qty[i.id] ?? 0) })).filter((l) => l.receivedQuantity > 0);
    start(async () => {
      const res = await fetch(`/api/inventory/purchase-orders/${id}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: lines }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error || "Failed");
        return;
      }
      setReceiving(false);
      router.refresh();
    });
  }

  const canSend = status === "DRAFT";
  const canReceive = status === "SENT" || status === "PARTIAL";
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {canSend ? <PrimaryButton disabled={isPending} onClick={send}>{isPending ? "Working..." : "Send to vendor"}</PrimaryButton> : null}
        {canReceive ? (
          <PrimaryButton disabled={isPending} onClick={() => setReceiving((r) => !r)}>
            {receiving ? "Cancel receive" : "Receive lines"}
          </PrimaryButton>
        ) : null}
        <ErrorText error={error} />
      </div>
      {receiving ? (
        <div className="space-y-2 p-3" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}>
          {items.map((i) => (
            <div key={i.id} className="flex items-center gap-3 text-sm">
              <span className="flex-1" style={{ color: "var(--kb-text-primary)" }}>
                {i.productName} ({i.receivedQuantity}/{i.quantity} received)
              </span>
              <input
                value={qty[i.id] ?? ""}
                onChange={(e) => setQty({ ...qty, [i.id]: e.target.value })}
                type="number"
                min={0}
                max={i.quantity - i.receivedQuantity}
                className="w-24 px-3 py-1.5"
                style={inputStyle}
              />
            </div>
          ))}
          <div className="flex justify-end">
            <PrimaryButton disabled={isPending} onClick={receive}>
              {isPending ? "Working..." : "Confirm receipt"}
            </PrimaryButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}
