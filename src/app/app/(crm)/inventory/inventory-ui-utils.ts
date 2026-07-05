/*
 * Pure helpers for the Inventory admin pages (Sprint 20). No "use client" so
 * both server pages and client components can import freely. Formatters live in
 * lib/inventory/inventory-utils; this file only holds page-level navigation
 * config and small view helpers.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */

export type InventoryTab = { key: string; label: string; href: string };

export const INVENTORY_TABS: InventoryTab[] = [
  { key: "dashboard", label: "Dashboard", href: "/app/inventory" },
  { key: "stock", label: "Stock", href: "/app/inventory/stock" },
  { key: "warehouses", label: "Warehouses", href: "/app/inventory/warehouses" },
  { key: "movements", label: "Movements", href: "/app/inventory/movements" },
  { key: "transfers", label: "Transfers", href: "/app/inventory/transfers" },
  { key: "vendors", label: "Vendors", href: "/app/inventory/vendors" },
  { key: "purchase-orders", label: "Purchase orders", href: "/app/inventory/purchase-orders" },
];

export const MOVEMENT_TYPE_OPTIONS = ["RECEIPT", "SHIPMENT", "ADJUSTMENT", "TRANSFER_OUT", "TRANSFER_IN", "RETURN"] as const;
