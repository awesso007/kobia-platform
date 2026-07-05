/*
 * Inventory write helpers (Sprint 20). CRUD for warehouses and vendors plus
 * creation of transfers and purchase orders (with their line items). Stock-level
 * side effects (movements, low-stock, status transitions) live in stock.ts; this
 * module only mutates the header/line records.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import type { PrismaClient } from "@/lib/db/generated/tenant";
import { nextTransferNumber, nextPoNumber } from "./numbering";

type Db = PrismaClient;

export type WarehouseInput = {
  name: string;
  code: string;
  address?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  isDefault?: boolean;
  active?: boolean;
};

export async function createWarehouse(db: Db, input: WarehouseInput): Promise<string> {
  const name = input.name.trim();
  const code = input.code.trim().toUpperCase();
  if (!name) throw new Error("Warehouse name is required.");
  if (!code) throw new Error("Warehouse code is required.");
  return db.$transaction(async (tx) => {
    if (input.isDefault) await tx.warehouse.updateMany({ data: { isDefault: false } });
    const w = await tx.warehouse.create({
      data: {
        name,
        code,
        address: input.address?.trim() || null,
        city: input.city?.trim() || null,
        region: input.region?.trim() || null,
        country: input.country?.trim() || null,
        isDefault: input.isDefault ?? false,
        active: input.active ?? true,
      },
    });
    return w.id;
  });
}

export async function updateWarehouse(db: Db, id: string, patch: Partial<WarehouseInput>): Promise<void> {
  await db.$transaction(async (tx) => {
    if (patch.isDefault) await tx.warehouse.updateMany({ where: { id: { not: id } }, data: { isDefault: false } });
    const data: Record<string, unknown> = {};
    if (patch.name !== undefined) data.name = patch.name.trim() || "Warehouse";
    if (patch.code !== undefined) data.code = patch.code.trim().toUpperCase();
    if (patch.address !== undefined) data.address = patch.address?.trim() || null;
    if (patch.city !== undefined) data.city = patch.city?.trim() || null;
    if (patch.region !== undefined) data.region = patch.region?.trim() || null;
    if (patch.country !== undefined) data.country = patch.country?.trim() || null;
    if (patch.isDefault !== undefined) data.isDefault = patch.isDefault;
    if (patch.active !== undefined) data.active = patch.active;
    if (Object.keys(data).length > 0) await tx.warehouse.update({ where: { id }, data });
  });
}

export async function deleteWarehouse(db: Db, id: string): Promise<void> {
  await db.warehouse.delete({ where: { id } });
}

export type VendorInput = {
  name: string;
  email?: string | null;
  phone?: string | null;
  contactName?: string | null;
  address?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  taxId?: string | null;
  paymentTerms?: string | null;
  notes?: string | null;
  active?: boolean;
};

export async function createVendor(db: Db, input: VendorInput): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new Error("Vendor name is required.");
  const v = await db.vendor.create({
    data: {
      name,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      contactName: input.contactName?.trim() || null,
      address: input.address?.trim() || null,
      city: input.city?.trim() || null,
      region: input.region?.trim() || null,
      country: input.country?.trim() || null,
      taxId: input.taxId?.trim() || null,
      paymentTerms: input.paymentTerms?.trim() || null,
      notes: input.notes?.trim() || null,
      active: input.active ?? true,
    },
  });
  return v.id;
}

export async function updateVendor(db: Db, id: string, patch: Partial<VendorInput>): Promise<void> {
  const data: Record<string, unknown> = {};
  for (const key of ["name", "email", "phone", "contactName", "address", "city", "region", "country", "taxId", "paymentTerms", "notes"] as const) {
    if (patch[key] !== undefined) data[key] = (patch[key] as string | null)?.toString().trim() || (key === "name" ? "Vendor" : null);
  }
  if (patch.active !== undefined) data.active = patch.active;
  if (Object.keys(data).length > 0) await db.vendor.update({ where: { id }, data });
}

export async function deleteVendor(db: Db, id: string): Promise<void> {
  await db.vendor.delete({ where: { id } });
}

export type TransferInput = {
  fromWarehouseId: string;
  toWarehouseId: string;
  notes?: string | null;
  items: { productId: string; quantity: number }[];
  createdById?: string | null;
};

export async function createTransfer(db: Db, input: TransferInput): Promise<string> {
  if (input.fromWarehouseId === input.toWarehouseId) throw new Error("From and to warehouses must differ.");
  const items = input.items.filter((i) => i.productId && Math.trunc(i.quantity) > 0);
  if (items.length === 0) throw new Error("At least one line item is required.");
  return db.$transaction(async (tx) => {
    const transferNumber = await nextTransferNumber(tx);
    const transfer = await tx.stockTransfer.create({
      data: {
        transferNumber,
        fromWarehouseId: input.fromWarehouseId,
        toWarehouseId: input.toWarehouseId,
        notes: input.notes?.trim() || null,
        createdById: input.createdById ?? null,
        items: { create: items.map((i) => ({ productId: i.productId, quantity: Math.trunc(i.quantity) })) },
      },
    });
    return transfer.id;
  });
}

export async function updateTransfer(db: Db, id: string, patch: { notes?: string | null; status?: string }): Promise<void> {
  const data: Record<string, unknown> = {};
  if (patch.notes !== undefined) data.notes = patch.notes?.trim() || null;
  if (patch.status !== undefined) data.status = patch.status;
  if (Object.keys(data).length > 0) await db.stockTransfer.update({ where: { id }, data });
}

export type PurchaseOrderInput = {
  vendorId: string;
  warehouseId: string;
  currency?: string;
  taxCents?: number;
  expectedDate?: Date | null;
  notes?: string | null;
  items: { productId: string; quantity: number; unitCostCents: number }[];
};

export async function createPurchaseOrder(db: Db, input: PurchaseOrderInput): Promise<string> {
  const items = input.items.filter((i) => i.productId && Math.trunc(i.quantity) > 0);
  if (items.length === 0) throw new Error("At least one line item is required.");
  const subtotalCents = items.reduce((sum, i) => sum + Math.trunc(i.quantity) * Math.trunc(i.unitCostCents), 0);
  const taxCents = Math.trunc(input.taxCents ?? 0);
  return db.$transaction(async (tx) => {
    const poNumber = await nextPoNumber(tx);
    const po = await tx.purchaseOrder.create({
      data: {
        poNumber,
        vendorId: input.vendorId,
        warehouseId: input.warehouseId,
        currency: input.currency || "USD",
        subtotalCents,
        taxCents,
        totalCents: subtotalCents + taxCents,
        expectedDate: input.expectedDate ?? null,
        notes: input.notes?.trim() || null,
        items: {
          create: items.map((i) => ({ productId: i.productId, quantity: Math.trunc(i.quantity), unitCostCents: Math.trunc(i.unitCostCents) })),
        },
      },
    });
    return po.id;
  });
}

export async function updatePurchaseOrder(
  db: Db,
  id: string,
  patch: { status?: string; notes?: string | null; expectedDate?: Date | null },
): Promise<void> {
  const data: Record<string, unknown> = {};
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.notes !== undefined) data.notes = patch.notes?.trim() || null;
  if (patch.expectedDate !== undefined) data.expectedDate = patch.expectedDate;
  if (patch.status === "SENT") data.sentAt = new Date();
  if (Object.keys(data).length > 0) await db.purchaseOrder.update({ where: { id }, data });
}
