/*
 * seed-inventory-acme.ts - populate a tenant schema with Sprint 20 Inventory /
 * Warehouse starter data. Idempotent: warehouses are found by code, vendors by
 * name, products upserted by sku, and the sample transfer/PO created only once
 * (found by their deterministic first line). Re-running does not duplicate.
 *
 * Seeds:
 *   - 2 Warehouses: Main (code=MAIN, default), Overflow (code=OVR)
 *   - 3 tracked Products (upserted by sku): INV-WIDGET, INV-GADGET, INV-GIZMO
 *   - StockItems: Main 50 each (threshold 10), Overflow 20 each
 *   - 1 RECEIPT movement per product into Main
 *   - 2 Vendors: "Acme Wholesale Supply", "Global Parts Co"
 *   - 1 DRAFT PurchaseOrder (2 line items) from Acme Wholesale into Main
 *   - 1 DRAFT StockTransfer (1 line item) Main -> Overflow
 *
 * Usage:
 *   tsx scripts/seed-inventory-acme.ts --slug acme
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { PrismaClient } from "../src/lib/db/generated/tenant";

function fail(msg: string): never {
  console.error(`\n[seed-inventory] ERROR: ${msg}\n`);
  process.exit(1);
}

function parseSlug(argv: string[]): string {
  let slug: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--slug") slug = argv[++i];
  }
  return slug ?? "acme";
}

function schemaNameForSlug(slug: string): string {
  return `tenant_${slug.replace(/-/g, "_")}`;
}

function connectionForSchema(schema: string): string {
  const base = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!base) fail("DIRECT_URL/DATABASE_URL not set");
  const url = new URL(base);
  url.searchParams.set("schema", schema);
  return url.toString();
}

const PRODUCTS = [
  { sku: "INV-WIDGET", name: "Standard Widget", barcode: "0810000000017", unitPriceCents: 2999, costCents: 1200, reorderPoint: 15, weightGrams: 250 },
  { sku: "INV-GADGET", name: "Deluxe Gadget", barcode: "0810000000024", unitPriceCents: 5999, costCents: 2600, reorderPoint: 12, weightGrams: 400 },
  { sku: "INV-GIZMO", name: "Compact Gizmo", barcode: "0810000000031", unitPriceCents: 1499, costCents: 600, reorderPoint: 20, weightGrams: 120 },
];

async function main() {
  const slug = parseSlug(process.argv.slice(2));
  const schema = schemaNameForSlug(slug);
  const db = new PrismaClient({ datasources: { db: { url: connectionForSchema(schema) } } });

  try {
    console.log(`[seed-inventory] schema=${schema}`);

    // Warehouses (by code)
    const main = await db.warehouse.upsert({
      where: { code: "MAIN" },
      update: {},
      create: { name: "Main Warehouse", code: "MAIN", city: "Austin", region: "TX", country: "US", isDefault: true },
    });
    const overflow = await db.warehouse.upsert({
      where: { code: "OVR" },
      update: {},
      create: { name: "Overflow Depot", code: "OVR", city: "Dallas", region: "TX", country: "US" },
    });
    console.log(`  warehouses: MAIN=${main.id} OVR=${overflow.id}`);

    // Products (upsert by sku, mark tracked)
    const products = [] as { id: string; sku: string }[];
    for (const p of PRODUCTS) {
      const row = await db.product.upsert({
        where: { sku: p.sku },
        update: { barcode: p.barcode, trackInventory: true, reorderPoint: p.reorderPoint, weightGrams: p.weightGrams, costCents: p.costCents },
        create: {
          sku: p.sku,
          name: p.name,
          barcode: p.barcode,
          trackInventory: true,
          reorderPoint: p.reorderPoint,
          weightGrams: p.weightGrams,
          unitPriceCents: p.unitPriceCents,
          costCents: p.costCents,
          category: "Inventory",
        },
      });
      products.push({ id: row.id, sku: p.sku });
    }
    console.log(`  products: ${products.map((p) => p.sku).join(", ")}`);

    // Stock items + one RECEIPT per product into Main
    for (const p of products) {
      await db.stockItem.upsert({
        where: { productId_warehouseId: { productId: p.id, warehouseId: main.id } },
        update: {},
        create: { productId: p.id, warehouseId: main.id, quantity: 50, lowStockThreshold: 10 },
      });
      await db.stockItem.upsert({
        where: { productId_warehouseId: { productId: p.id, warehouseId: overflow.id } },
        update: {},
        create: { productId: p.id, warehouseId: overflow.id, quantity: 20, lowStockThreshold: 10 },
      });
      const hasReceipt = await db.stockMovement.findFirst({ where: { productId: p.id, warehouseId: main.id, type: "RECEIPT" } });
      if (!hasReceipt) {
        await db.stockMovement.create({
          data: { productId: p.id, warehouseId: main.id, type: "RECEIPT", quantity: 50, referenceType: "SEED", note: "Initial stock" },
        });
      }
    }
    console.log("  stock items + receipts ready");

    // Vendors (by name)
    async function ensureVendor(name: string, data: Record<string, unknown>) {
      const existing = await db.vendor.findFirst({ where: { name } });
      if (existing) return existing;
      return db.vendor.create({ data: { name, ...data } });
    }
    const acmeVendor = await ensureVendor("Acme Wholesale Supply", { email: "orders@acmewholesale.example", city: "Houston", paymentTerms: "Net 30" });
    await ensureVendor("Global Parts Co", { email: "sales@globalparts.example", city: "Chicago", paymentTerms: "Net 15" });
    console.log(`  vendors ready (Acme=${acmeVendor.id})`);

    // Draft purchase order (2 lines) from Acme Wholesale into Main
    const existingPo = await db.purchaseOrder.findFirst({ where: { vendorId: acmeVendor.id, warehouseId: main.id } });
    if (!existingPo) {
      const poLines = [
        { productId: products[0]!.id, quantity: 25, unitCostCents: 1200 },
        { productId: products[1]!.id, quantity: 10, unitCostCents: 2600 },
      ];
      const subtotal = poLines.reduce((s, l) => s + l.quantity * l.unitCostCents, 0);
      const lastPo = await db.purchaseOrder.findFirst({ orderBy: { createdAt: "desc" }, select: { poNumber: true } });
      const nextNum = lastPo ? Number(lastPo.poNumber.replace(/\D/g, "")) + 1 : 1001;
      await db.purchaseOrder.create({
        data: {
          poNumber: `PO-${nextNum}`,
          vendorId: acmeVendor.id,
          warehouseId: main.id,
          subtotalCents: subtotal,
          totalCents: subtotal,
          items: { create: poLines },
        },
      });
      console.log(`  draft PO created (PO-${nextNum})`);
    } else {
      console.log("  draft PO already present");
    }

    // Draft transfer (1 line) Main -> Overflow
    const existingTransfer = await db.stockTransfer.findFirst({ where: { fromWarehouseId: main.id, toWarehouseId: overflow.id } });
    if (!existingTransfer) {
      const lastTr = await db.stockTransfer.findFirst({ orderBy: { createdAt: "desc" }, select: { transferNumber: true } });
      const nextNum = lastTr ? Number(lastTr.transferNumber.replace(/\D/g, "")) + 1 : 1001;
      await db.stockTransfer.create({
        data: {
          transferNumber: `TR-${nextNum}`,
          fromWarehouseId: main.id,
          toWarehouseId: overflow.id,
          notes: "Rebalance stock to overflow depot.",
          items: { create: [{ productId: products[2]!.id, quantity: 10 }] },
        },
      });
      console.log(`  draft transfer created (TR-${nextNum})`);
    } else {
      console.log("  draft transfer already present");
    }

    const [warehouses, stockItems, movements, vendors, pos, transfers] = await Promise.all([
      db.warehouse.count(),
      db.stockItem.count(),
      db.stockMovement.count(),
      db.vendor.count(),
      db.purchaseOrder.count(),
      db.stockTransfer.count(),
    ]);
    console.log(
      `\n[seed-inventory] done: warehouses=${warehouses} stockItems=${stockItems} movements=${movements} vendors=${vendors} purchaseOrders=${pos} transfers=${transfers}`,
    );
  } catch (err) {
    fail(String(err instanceof Error ? err.message : err));
  } finally {
    await db.$disconnect();
  }
}

main();
