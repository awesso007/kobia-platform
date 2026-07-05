/*
 * Pure formatters and helpers for the Inventory / Warehouse module (Sprint 20).
 * No "use client" so both server pages and client components import freely.
 *
 * StockMovement.quantity is stored as a SIGNED change (positive for inbound
 * types, negative for outbound); signForMovementType derives the sign for the
 * directional types, while ADJUSTMENT carries its own sign.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */

export type MovementType = "RECEIPT" | "SHIPMENT" | "ADJUSTMENT" | "TRANSFER_OUT" | "TRANSFER_IN" | "RETURN";

export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  RECEIPT: "Receipt",
  SHIPMENT: "Shipment",
  ADJUSTMENT: "Adjustment",
  TRANSFER_OUT: "Transfer out",
  TRANSFER_IN: "Transfer in",
  RETURN: "Return",
};

/** +1 for inbound movements, -1 for outbound. ADJUSTMENT carries its own sign. */
export function signForMovementType(type: MovementType): 1 | -1 {
  switch (type) {
    case "RECEIPT":
    case "TRANSFER_IN":
    case "RETURN":
      return 1;
    case "SHIPMENT":
    case "TRANSFER_OUT":
      return -1;
    case "ADJUSTMENT":
      return 1;
    default:
      return 1;
  }
}

export function fmtQuantity(n: number | null | undefined): string {
  if (n === null || n === undefined) return "-";
  return new Intl.NumberFormat().format(n);
}

export function fmtSignedQuantity(n: number): string {
  const s = new Intl.NumberFormat().format(Math.abs(n));
  return n < 0 ? `-${s}` : `+${s}`;
}

export function fmtCurrencyCents(cents: number | null | undefined, currency = "USD"): string {
  if (cents === null || cents === undefined) return "-";
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(undefined, { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function statusColor(status: string): string {
  switch (status) {
    case "RECEIVED":
    case "SENT":
      return "#059669";
    case "IN_TRANSIT":
    case "PARTIAL":
    case "PENDING":
      return "#d97706";
    case "CANCELED":
      return "#dc2626";
    case "DRAFT":
      return "#6b7280";
    default:
      return "#6b7280";
  }
}

export type StockLevel = "out" | "low" | "ok";

/** Classify an available quantity against its low-stock threshold. */
export function stockLevel(quantity: number, threshold: number): StockLevel {
  if (quantity <= 0) return "out";
  if (quantity <= threshold) return "low";
  return "ok";
}

export function stockLevelColor(level: StockLevel): string {
  switch (level) {
    case "out":
      return "#dc2626";
    case "low":
      return "#d97706";
    case "ok":
      return "#059669";
  }
}
