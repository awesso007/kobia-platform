/**
 * FX / multi-currency utilities.
 *
 * Storage convention:
 *   `rate` means: 1 unit of fromCurrency = `rate` units of toCurrency.
 *   Example: USD->CAD rate 1.365 means 1 USD = 1.365 CAD.
 *
 * Conversion convention:
 *   - The ledger always stores BASE-currency cents on each JournalLine (Lock from cycle 2).
 *   - Source documents (Invoice / Bill) store ORIGINAL currency cents + fxRate + computed baseTotalCents.
 *   - To get base from original: floor(originalCents * rate).
 */
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export const SUPPORTED_CURRENCIES = [
  "USD",
  "CAD",
  "EUR",
  "GBP",
  "AUD",
  "JPY",
  "MXN",
  "INR",
] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export function isSupportedCurrency(c: string): c is Currency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(c);
}

export class FxError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "FxError";
  }
}

/** UTC midnight of the given date. */
function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Look up the most recent rate at or before `asOf` for the (from -> to) pair.
 * Returns null if no rate is on file (caller must handle).
 */
export async function getRate(
  tenantId: string,
  fromCurrency: string,
  toCurrency: string,
  asOf: Date = new Date()
): Promise<{ rate: Prisma.Decimal; rateDate: Date } | null> {
  if (fromCurrency === toCurrency) {
    return { rate: new Prisma.Decimal(1), rateDate: utcMidnight(asOf) };
  }
  const row = await db.exchangeRate.findFirst({
    where: {
      tenantId,
      fromCurrency,
      toCurrency,
      rateDate: { lte: utcMidnight(asOf) },
    },
    orderBy: { rateDate: "desc" },
    select: { rate: true, rateDate: true },
  });
  return row;
}

/** Convert an amount (cents in fromCurrency) into base-currency cents, floored. */
export function convert(
  amountCents: bigint,
  rate: Prisma.Decimal | number | string
): bigint {
  const r = new Prisma.Decimal(rate.toString());
  // amountCents * rate, then floor to bigint.
  const product = r.mul(amountCents.toString());
  const floored = product.floor();
  return BigInt(floored.toString());
}

/** Insert or update an exchange rate (idempotent on the unique key). */
export async function upsertRate(input: {
  tenantId: string;
  fromCurrency: string;
  toCurrency: string;
  rate: string | number | Prisma.Decimal;
  rateDate: Date;
  source?: string;
  createdByUserId?: string;
}) {
  if (!isSupportedCurrency(input.fromCurrency)) throw new FxError("BAD_CURRENCY", `Unsupported currency: ${input.fromCurrency}`);
  if (!isSupportedCurrency(input.toCurrency)) throw new FxError("BAD_CURRENCY", `Unsupported currency: ${input.toCurrency}`);
  const rateDec = new Prisma.Decimal(input.rate.toString());
  if (rateDec.lte(0)) throw new FxError("BAD_RATE", "Rate must be positive.");

  const day = utcMidnight(input.rateDate);
  return db.exchangeRate.upsert({
    where: {
      tenantId_fromCurrency_toCurrency_rateDate: {
        tenantId: input.tenantId,
        fromCurrency: input.fromCurrency,
        toCurrency: input.toCurrency,
        rateDate: day,
      },
    },
    update: { rate: rateDec, source: input.source ?? "manual", createdByUserId: input.createdByUserId },
    create: {
      tenantId: input.tenantId,
      fromCurrency: input.fromCurrency,
      toCurrency: input.toCurrency,
      rate: rateDec,
      rateDate: day,
      source: input.source ?? "manual",
      createdByUserId: input.createdByUserId,
    },
  });
}

/**
 * Compute base-currency cents for a transaction:
 *  - Same currency → identity, fxRate = 1, baseCents = originalCents.
 *  - Different currency → look up rate (most recent <= asOf). Throws if none.
 */
export async function toBaseAmount(input: {
  tenantId: string;
  fromCurrency: string;
  toCurrency: string;
  asOf: Date;
  originalCents: bigint;
}): Promise<{ rate: Prisma.Decimal; baseCents: bigint; rateDate: Date }> {
  if (input.fromCurrency === input.toCurrency) {
    return {
      rate: new Prisma.Decimal(1),
      baseCents: input.originalCents,
      rateDate: utcMidnight(input.asOf),
    };
  }
  const lookup = await getRate(input.tenantId, input.fromCurrency, input.toCurrency, input.asOf);
  if (!lookup) {
    throw new FxError(
      "MISSING_RATE",
      `No exchange rate on file for ${input.fromCurrency} → ${input.toCurrency}. Add one in Settings → Currencies.`
    );
  }
  return {
    rate: lookup.rate,
    baseCents: convert(input.originalCents, lookup.rate),
    rateDate: lookup.rateDate,
  };
}

/** Format an amount in cents into a localized currency string. */
export function formatMoney(cents: bigint, currency: string): string {
  const num = Number(cents) / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "code",
    }).format(num);
  } catch {
    return `${currency} ${num.toFixed(2)}`;
  }
}
