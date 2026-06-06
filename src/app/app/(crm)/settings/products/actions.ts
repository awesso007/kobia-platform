"use server";

/*
 * Product + ProductCategory management (Sprint 10). Products are the catalog
 * that line items (deals + quotes) draw from. Categories form a tree (parentId).
 * All DB access routes through getTenantDb(); non-CRM entities audit under the
 * COMPANY stand-in with the real type in diff. CSV import/export are bulk helpers
 * for the products list. No em-dashes in copy (use hyphens).
 */
import { revalidatePath } from "next/cache";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { auditWrite } from "@/lib/crm/audit";
import { requirePermission } from "@/lib/rbac/require-permission";

const PRODUCT_TYPES = ["ONE_TIME", "RECURRING_MONTHLY", "RECURRING_YEARLY", "SERVICE"] as const;
type ProductType = (typeof PRODUCT_TYPES)[number];

function asType(v: unknown): ProductType {
  return PRODUCT_TYPES.includes(v as ProductType) ? (v as ProductType) : "ONE_TIME";
}

export type ProductInput = {
  sku: string;
  name: string;
  description?: string | null;
  type: string;
  unitPriceCents: number;
  currency?: string;
  costCents?: number | null;
  taxable?: boolean;
  active?: boolean;
  category?: string | null;
  sortOrder?: number;
};

/** Slugify a name into a SKU suggestion: upper-kebab, alnum only. */
export async function suggestSku(name: string): Promise<string> {
  const base = name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24);
  if (!base) return "";
  const { db } = getTenantDb();
  let candidate = base;
  let n = 1;
  while (await db.product.findUnique({ where: { sku: candidate } })) {
    n += 1;
    candidate = `${base}-${n}`;
  }
  return candidate;
}

export async function createProduct(input: ProductInput): Promise<string> {
  await requirePermission("record:create");
  const sku = input.sku?.trim();
  const name = input.name?.trim();
  if (!sku) throw new Error("SKU is required.");
  if (!name) throw new Error("Product name is required.");
  const { db } = getTenantDb();
  const p = await db.product.create({
    data: {
      sku,
      name,
      description: input.description ?? null,
      type: asType(input.type),
      unitPriceCents: Math.round(input.unitPriceCents || 0),
      currency: input.currency?.trim() || "USD",
      costCents: input.costCents != null ? Math.round(input.costCents) : null,
      taxable: input.taxable ?? true,
      active: input.active ?? true,
      category: input.category?.trim() || null,
      sortOrder: input.sortOrder ?? 0,
    },
  });
  await auditWrite({ action: "CREATE", entityType: "COMPANY", entityId: p.id, diff: { kind: "Product", sku, name } });
  revalidatePath("/app/settings/products");
  return p.id;
}

export async function updateProduct(id: string, input: Partial<ProductInput>): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  const data: Record<string, unknown> = {};
  if (input.sku !== undefined) { const v = input.sku.trim(); if (!v) throw new Error("SKU is required."); data.sku = v; }
  if (input.name !== undefined) { const v = input.name.trim(); if (!v) throw new Error("Name is required."); data.name = v; }
  if (input.description !== undefined) data.description = input.description;
  if (input.type !== undefined) data.type = asType(input.type);
  if (input.unitPriceCents !== undefined) data.unitPriceCents = Math.round(input.unitPriceCents || 0);
  if (input.currency !== undefined) data.currency = input.currency.trim() || "USD";
  if (input.costCents !== undefined) data.costCents = input.costCents != null ? Math.round(input.costCents) : null;
  if (input.taxable !== undefined) data.taxable = input.taxable;
  if (input.active !== undefined) data.active = input.active;
  if (input.category !== undefined) data.category = input.category?.trim() || null;
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
  await db.product.update({ where: { id }, data });
  await auditWrite({ action: "UPDATE", entityType: "COMPANY", entityId: id, diff: { kind: "Product", ...data } });
  revalidatePath("/app/settings/products");
}

export async function toggleProductActive(id: string, active: boolean): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  await db.product.update({ where: { id }, data: { active } });
  await auditWrite({ action: "UPDATE", entityType: "COMPANY", entityId: id, diff: { kind: "Product", active } });
  revalidatePath("/app/settings/products");
}

export async function deleteProduct(id: string): Promise<void> {
  await requirePermission("record:delete");
  const { db } = getTenantDb();
  await db.product.delete({ where: { id } });
  await auditWrite({ action: "DELETE", entityType: "COMPANY", entityId: id, diff: { kind: "Product" } });
  revalidatePath("/app/settings/products");
}

// ---- Categories (tree) -----------------------------------------------------

export async function createCategory(input: { name: string; parentId?: string | null }): Promise<string> {
  await requirePermission("record:update");
  const name = input.name?.trim();
  if (!name) throw new Error("Category name is required.");
  const { db } = getTenantDb();
  const max = await db.productCategory.aggregate({ where: { parentId: input.parentId ?? null }, _max: { sortOrder: true } });
  const c = await db.productCategory.create({
    data: { name, parentId: input.parentId ?? null, sortOrder: (max._max.sortOrder ?? 0) + 1 },
  });
  await auditWrite({ action: "CREATE", entityType: "COMPANY", entityId: c.id, diff: { kind: "ProductCategory", name } });
  revalidatePath("/app/settings/products/categories");
  return c.id;
}

export async function renameCategory(id: string, name: string): Promise<void> {
  await requirePermission("record:update");
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Category name is required.");
  const { db } = getTenantDb();
  await db.productCategory.update({ where: { id }, data: { name: trimmed } });
  await auditWrite({ action: "UPDATE", entityType: "COMPANY", entityId: id, diff: { kind: "ProductCategory", name: trimmed } });
  revalidatePath("/app/settings/products/categories");
}

export async function deleteCategory(id: string): Promise<void> {
  await requirePermission("record:delete");
  const { db } = getTenantDb();
  // Re-parent children to this node's parent so the tree stays valid.
  const node = await db.productCategory.findUniqueOrThrow({ where: { id } });
  await db.$transaction([
    db.productCategory.updateMany({ where: { parentId: id }, data: { parentId: node.parentId } }),
    db.productCategory.delete({ where: { id } }),
  ]);
  await auditWrite({ action: "DELETE", entityType: "COMPANY", entityId: id, diff: { kind: "ProductCategory" } });
  revalidatePath("/app/settings/products/categories");
}

// ---- CSV import / export ---------------------------------------------------

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Read-only CSV export of all products. requirePermission record:read. */
export async function exportProductsCsv(): Promise<string> {
  await requirePermission("record:read");
  const { db } = getTenantDb();
  const products = await db.product.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  const headers = ["sku", "name", "description", "type", "unitPrice", "currency", "cost", "taxable", "active", "category"];
  const lines = [headers.join(",")];
  for (const p of products) {
    lines.push([
      p.sku,
      p.name,
      p.description ?? "",
      p.type,
      (p.unitPriceCents / 100).toFixed(2),
      p.currency,
      p.costCents != null ? (p.costCents / 100).toFixed(2) : "",
      p.taxable ? "true" : "false",
      p.active ? "true" : "false",
      p.category ?? "",
    ].map(csvCell).join(","));
  }
  return lines.join("\n");
}

/** Parse one CSV line honoring simple double-quote escaping. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * Import products from CSV text. Header row required (sku,name,...). Existing SKUs
 * are updated; new SKUs are created. Returns counts. requirePermission record:create.
 */
export async function importProductsCsv(csv: string): Promise<{ created: number; updated: number; skipped: number }> {
  await requirePermission("record:create");
  const { db } = getTenantDb();
  const rows = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (rows.length < 2) return { created: 0, updated: 0, skipped: 0 };
  const header = parseCsvLine(rows[0]!).map((h) => h.trim().toLowerCase());
  const idx = (k: string) => header.indexOf(k);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  for (let r = 1; r < rows.length; r++) {
    const cells = parseCsvLine(rows[r]!);
    const sku = (cells[idx("sku")] ?? "").trim();
    const name = (cells[idx("name")] ?? "").trim();
    if (!sku || !name) { skipped++; continue; }
    const toCents = (v: string | undefined) => {
      const n = Number((v ?? "").trim());
      return Number.isFinite(n) ? Math.round(n * 100) : 0;
    };
    const data = {
      name,
      description: (cells[idx("description")] ?? "").trim() || null,
      type: asType((cells[idx("type")] ?? "").trim().toUpperCase()),
      unitPriceCents: toCents(cells[idx("unitprice")]),
      currency: (cells[idx("currency")] ?? "").trim() || "USD",
      costCents: idx("cost") >= 0 && (cells[idx("cost")] ?? "").trim() !== "" ? toCents(cells[idx("cost")]) : null,
      taxable: (cells[idx("taxable")] ?? "true").trim().toLowerCase() !== "false",
      active: (cells[idx("active")] ?? "true").trim().toLowerCase() !== "false",
      category: (cells[idx("category")] ?? "").trim() || null,
    };
    const existing = await db.product.findUnique({ where: { sku } });
    if (existing) {
      await db.product.update({ where: { sku }, data });
      updated++;
    } else {
      await db.product.create({ data: { sku, ...data } });
      created++;
    }
  }
  await auditWrite({ action: "UPDATE", entityType: "COMPANY", entityId: "csv-import", diff: { kind: "ProductImport", created, updated, skipped } });
  revalidatePath("/app/settings/products");
  return { created, updated, skipped };
}
