/*
 * Inventory read helpers (Sprint 20). Every function takes an explicit db so it
 * works inside a request scope (getTenantDb) and outside one (getTenantPrisma by
 * schema, used by the cron and seed scripts).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import type { PrismaClient } from "@/lib/db/generated/tenant";

type Db = PrismaClient;

export type DashboardStats = {
  warehouseCount: number;
  skuTrackedCount: number;
  lowStockCount: number;
  totalOnHand: number;
  recentMovements: MovementRow[];
};

export type MovementRow = {
  id: string;
  type: string;
  quantity: number;
  productName: string;
  sku: string | null;
  warehouseName: string;
  note: string | null;
  referenceType: string | null;
  createdAt: Date;
};

async function decorateMovements(db: Db, rows: Awaited<ReturnType<Db["stockMovement"]["findMany"]>>): Promise<MovementRow[]> {
  const productIds = [...new Set(rows.map((r) => r.productId))];
  const warehouseIds = [...new Set(rows.map((r) => r.warehouseId))];
  const [products, warehouses] = await Promise.all([
    db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, sku: true } }),
    db.warehouse.findMany({ where: { id: { in: warehouseIds } }, select: { id: true, name: true } }),
  ]);
  const pMap = new Map(products.map((p) => [p.id, p]));
  const wMap = new Map(warehouses.map((w) => [w.id, w]));
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    quantity: r.quantity,
    productName: pMap.get(r.productId)?.name ?? r.productId,
    sku: pMap.get(r.productId)?.sku ?? null,
    warehouseName: wMap.get(r.warehouseId)?.name ?? r.warehouseId,
    note: r.note,
    referenceType: r.referenceType,
    createdAt: r.createdAt,
  }));
}

export async function getDashboardStats(db: Db): Promise<DashboardStats> {
  const [warehouseCount, stockItems, recent] = await Promise.all([
    db.warehouse.count({ where: { active: true } }),
    db.stockItem.findMany({ select: { productId: true, quantity: true, lowStockThreshold: true } }),
    db.stockMovement.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
  ]);
  const skuTracked = new Set(stockItems.map((s) => s.productId));
  const lowStockCount = stockItems.filter((s) => s.quantity <= s.lowStockThreshold).length;
  const totalOnHand = stockItems.reduce((sum, s) => sum + s.quantity, 0);
  return {
    warehouseCount,
    skuTrackedCount: skuTracked.size,
    lowStockCount,
    totalOnHand,
    recentMovements: await decorateMovements(db, recent),
  };
}

export async function listWarehouses(db: Db) {
  const rows = await db.warehouse.findMany({
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    include: { _count: { select: { stockItems: true } } },
  });
  return rows.map((w) => ({
    id: w.id,
    name: w.name,
    code: w.code,
    city: w.city,
    region: w.region,
    country: w.country,
    isDefault: w.isDefault,
    active: w.active,
    skuCount: w._count.stockItems,
    updatedAt: w.updatedAt,
  }));
}

export async function getWarehouse(db: Db, id: string) {
  const warehouse = await db.warehouse.findUnique({ where: { id } });
  if (!warehouse) return null;
  const items = await db.stockItem.findMany({ where: { warehouseId: id }, orderBy: { updatedAt: "desc" } });
  const products = await db.product.findMany({
    where: { id: { in: items.map((i) => i.productId) } },
    select: { id: true, name: true, sku: true },
  });
  const pMap = new Map(products.map((p) => [p.id, p]));
  return {
    warehouse,
    stock: items.map((i) => ({
      id: i.id,
      productId: i.productId,
      productName: pMap.get(i.productId)?.name ?? i.productId,
      sku: pMap.get(i.productId)?.sku ?? null,
      quantity: i.quantity,
      reservedQuantity: i.reservedQuantity,
      lowStockThreshold: i.lowStockThreshold,
      locationCode: i.locationCode,
    })),
  };
}

export type StockRow = {
  productId: string;
  warehouseId: string;
  productName: string;
  sku: string | null;
  warehouseName: string;
  quantity: number;
  reservedQuantity: number;
  lowStockThreshold: number;
  locationCode: string | null;
};

export async function listStock(db: Db, opts?: { search?: string; warehouseId?: string }): Promise<StockRow[]> {
  const items = await db.stockItem.findMany({
    where: opts?.warehouseId ? { warehouseId: opts.warehouseId } : undefined,
    orderBy: { updatedAt: "desc" },
    take: 500,
  });
  const [products, warehouses] = await Promise.all([
    db.product.findMany({ where: { id: { in: [...new Set(items.map((i) => i.productId))] } }, select: { id: true, name: true, sku: true } }),
    db.warehouse.findMany({ where: { id: { in: [...new Set(items.map((i) => i.warehouseId))] } }, select: { id: true, name: true } }),
  ]);
  const pMap = new Map(products.map((p) => [p.id, p]));
  const wMap = new Map(warehouses.map((w) => [w.id, w]));
  const search = opts?.search?.trim().toLowerCase();
  return items
    .map((i) => ({
      productId: i.productId,
      warehouseId: i.warehouseId,
      productName: pMap.get(i.productId)?.name ?? i.productId,
      sku: pMap.get(i.productId)?.sku ?? null,
      warehouseName: wMap.get(i.warehouseId)?.name ?? i.warehouseId,
      quantity: i.quantity,
      reservedQuantity: i.reservedQuantity,
      lowStockThreshold: i.lowStockThreshold,
      locationCode: i.locationCode,
    }))
    .filter((r) => !search || r.productName.toLowerCase().includes(search) || (r.sku ?? "").toLowerCase().includes(search));
}

export async function listMovements(
  db: Db,
  opts?: { productId?: string; warehouseId?: string; type?: string; from?: Date; to?: Date; page?: number; pageSize?: number },
): Promise<{ rows: MovementRow[]; total: number; page: number; pageSize: number }> {
  const pageSize = opts?.pageSize ?? 50;
  const page = Math.max(1, opts?.page ?? 1);
  const where: Record<string, unknown> = {};
  if (opts?.productId) where.productId = opts.productId;
  if (opts?.warehouseId) where.warehouseId = opts.warehouseId;
  if (opts?.type) where.type = opts.type;
  if (opts?.from || opts?.to) where.createdAt = { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lte: opts.to } : {}) };
  const [total, rows] = await Promise.all([
    db.stockMovement.count({ where }),
    db.stockMovement.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return { rows: await decorateMovements(db, rows), total, page, pageSize };
}

export async function listTransfers(db: Db, opts?: { status?: string }) {
  const rows = await db.stockTransfer.findMany({
    where: opts?.status ? { status: opts.status as never } : undefined,
    orderBy: { createdAt: "desc" },
    include: { fromWarehouse: { select: { name: true } }, toWarehouse: { select: { name: true } }, _count: { select: { items: true } } },
  });
  return rows.map((t) => ({
    id: t.id,
    transferNumber: t.transferNumber,
    status: t.status,
    fromWarehouseName: t.fromWarehouse.name,
    toWarehouseName: t.toWarehouse.name,
    itemCount: t._count.items,
    createdAt: t.createdAt,
    sentAt: t.sentAt,
    receivedAt: t.receivedAt,
  }));
}

export async function getTransfer(db: Db, id: string) {
  const transfer = await db.stockTransfer.findUnique({
    where: { id },
    include: { fromWarehouse: true, toWarehouse: true, items: true },
  });
  if (!transfer) return null;
  const products = await db.product.findMany({
    where: { id: { in: transfer.items.map((i) => i.productId) } },
    select: { id: true, name: true, sku: true },
  });
  const pMap = new Map(products.map((p) => [p.id, p]));
  return {
    transfer,
    items: transfer.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      productName: pMap.get(i.productId)?.name ?? i.productId,
      sku: pMap.get(i.productId)?.sku ?? null,
      quantity: i.quantity,
      receivedQuantity: i.receivedQuantity,
    })),
  };
}

export async function listVendors(db: Db) {
  const rows = await db.vendor.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { purchaseOrders: true } } },
  });
  return rows.map((v) => ({
    id: v.id,
    name: v.name,
    email: v.email,
    phone: v.phone,
    contactName: v.contactName,
    city: v.city,
    active: v.active,
    poCount: v._count.purchaseOrders,
    updatedAt: v.updatedAt,
  }));
}

export async function getVendor(db: Db, id: string) {
  const vendor = await db.vendor.findUnique({ where: { id } });
  if (!vendor) return null;
  const purchaseOrders = await db.purchaseOrder.findMany({ where: { vendorId: id }, orderBy: { createdAt: "desc" } });
  return { vendor, purchaseOrders };
}

export async function listPurchaseOrders(db: Db, opts?: { status?: string }) {
  const rows = await db.purchaseOrder.findMany({
    where: opts?.status ? { status: opts.status as never } : undefined,
    orderBy: { createdAt: "desc" },
    include: { vendor: { select: { name: true } }, warehouse: { select: { name: true } }, _count: { select: { items: true } } },
  });
  return rows.map((p) => ({
    id: p.id,
    poNumber: p.poNumber,
    status: p.status,
    vendorName: p.vendor.name,
    warehouseName: p.warehouse.name,
    totalCents: p.totalCents,
    currency: p.currency,
    itemCount: p._count.items,
    expectedDate: p.expectedDate,
    createdAt: p.createdAt,
  }));
}

export async function getPurchaseOrder(db: Db, id: string) {
  const po = await db.purchaseOrder.findUnique({
    where: { id },
    include: { vendor: true, warehouse: true, items: true },
  });
  if (!po) return null;
  const products = await db.product.findMany({
    where: { id: { in: po.items.map((i) => i.productId) } },
    select: { id: true, name: true, sku: true },
  });
  const pMap = new Map(products.map((p) => [p.id, p]));
  return {
    po,
    items: po.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      productName: pMap.get(i.productId)?.name ?? i.productId,
      sku: pMap.get(i.productId)?.sku ?? null,
      quantity: i.quantity,
      receivedQuantity: i.receivedQuantity,
      unitCostCents: i.unitCostCents,
    })),
  };
}

/** Products available to inventory pickers (tracked first, then the rest). */
export async function listProductOptions(db: Db) {
  const products = await db.product.findMany({
    where: { active: true },
    orderBy: [{ trackInventory: "desc" }, { name: "asc" }],
    select: { id: true, name: true, sku: true, costCents: true, unitPriceCents: true, trackInventory: true },
    take: 500,
  });
  return products;
}

export async function listWarehouseOptions(db: Db) {
  return db.warehouse.findMany({ where: { active: true }, orderBy: [{ isDefault: "desc" }, { name: "asc" }], select: { id: true, name: true, code: true } });
}

export async function listVendorOptions(db: Db) {
  return db.vendor.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } });
}
