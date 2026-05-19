/**
 * Payroll withholding engine — IRS Pub 15-T 2026 percentage method.
 *
 * Scope (first cut):
 *   - Federal income tax using the standard 2026 percentage-method tables
 *     for SINGLE and MARRIED_JOINT filers (no Step 2 checkbox path yet).
 *   - Social Security at 6.2% up to the 2026 wage base ($176,100).
 *   - Medicare at 1.45% with no cap. (Additional Medicare 0.9% over $200K
 *     YTD per employee will land alongside W-2 filing.)
 *   - State withholding by jurisdiction. Phase 1 covers a handful of major
 *     states with a flat or simple bracket model; everything else falls
 *     back to 4% as a placeholder until a proper state engine ships.
 *
 * IMPORTANT: All inputs/outputs are in BigInt cents. No floats stored.
 */

// 2026 SS wage base. Configurable here when the IRS publishes a new value.
export const SS_WAGE_BASE_CENTS_2026 = 17_610_000n; // $176,100
export const SS_RATE = 0.062;
export const MEDICARE_RATE = 0.0145;

export type FilingStatus = "SINGLE" | "MARRIED_JOINT" | "HEAD_OF_HOUSEHOLD";
export type PayCadence = "weekly" | "biweekly" | "semimonthly" | "monthly";

interface FedBracket {
  /** Lower bound of taxable wages for the cadence (in dollars). */
  over: number;
  /** Flat amount of tax at this bracket (in dollars). */
  flatAmount: number;
  /** Marginal rate above `over`. */
  marginalRate: number;
}

/**
 * 2026 percentage-method tables (IRS Pub 15-T, automated payroll system).
 * Values shown are for BIWEEKLY pay periods, which we use as the canonical
 * cadence. We scale to other cadences with periodFactor.
 *
 * Source: IRS draft Pub 15-T 2026, percentage method tables (Form W-4 from
 * 2020 or later, Step 2 NOT checked).
 *
 * IMPORTANT: These are annualized tables divided by 26 — the exact numbers
 * are revised each fall by Treasury. Update annually.
 */
const FED_TABLES_2026_ANNUAL: Record<FilingStatus, FedBracket[]> = {
  SINGLE: [
    { over: 0, flatAmount: 0, marginalRate: 0 },
    { over: 6_400, flatAmount: 0, marginalRate: 0.1 },
    { over: 18_325, flatAmount: 1_192.5, marginalRate: 0.12 },
    { over: 53_775, flatAmount: 5_446.5, marginalRate: 0.22 },
    { over: 106_175, flatAmount: 16_974.5, marginalRate: 0.24 },
    { over: 197_950, flatAmount: 39_000.5, marginalRate: 0.32 },
    { over: 249_725, flatAmount: 55_568.5, marginalRate: 0.35 },
    { over: 615_350, flatAmount: 183_537.25, marginalRate: 0.37 },
  ],
  MARRIED_JOINT: [
    { over: 0, flatAmount: 0, marginalRate: 0 },
    { over: 17_400, flatAmount: 0, marginalRate: 0.1 },
    { over: 41_250, flatAmount: 2_385, marginalRate: 0.12 },
    { over: 112_150, flatAmount: 10_893, marginalRate: 0.22 },
    { over: 216_950, flatAmount: 33_949, marginalRate: 0.24 },
    { over: 400_500, flatAmount: 78_001, marginalRate: 0.32 },
    { over: 504_050, flatAmount: 111_137, marginalRate: 0.35 },
    { over: 747_500, flatAmount: 196_344.5, marginalRate: 0.37 },
  ],
  HEAD_OF_HOUSEHOLD: [
    { over: 0, flatAmount: 0, marginalRate: 0 },
    { over: 13_750, flatAmount: 0, marginalRate: 0.1 },
    { over: 30_175, flatAmount: 1_642.5, marginalRate: 0.12 },
    { over: 78_550, flatAmount: 7_447.5, marginalRate: 0.22 },
    { over: 117_350, flatAmount: 15_983.5, marginalRate: 0.24 },
    { over: 209_125, flatAmount: 38_009.5, marginalRate: 0.32 },
    { over: 260_900, flatAmount: 54_577.5, marginalRate: 0.35 },
    { over: 626_525, flatAmount: 182_546, marginalRate: 0.37 },
  ],
};

function cadenceToAnnualFactor(cadence: PayCadence): number {
  switch (cadence) {
    case "weekly":
      return 52;
    case "biweekly":
      return 26;
    case "semimonthly":
      return 24;
    case "monthly":
      return 12;
  }
}

/**
 * Compute federal income tax for one paycheck using the percentage method.
 *
 * Logic: annualize the period gross, look up the annual table, then divide
 * the resulting annual tax back down to the period.
 */
export function computeFederalIncomeTaxCents(args: {
  grossCents: bigint;
  filingStatus: FilingStatus;
  cadence: PayCadence;
  /** Optional employee-claimed additional withholding per period (cents). */
  extraWithholdingCents?: bigint;
}): bigint {
  const periodsPerYear = cadenceToAnnualFactor(args.cadence);
  const annualGross = Number(args.grossCents) / 100 * periodsPerYear;

  const table = FED_TABLES_2026_ANNUAL[args.filingStatus];
  // Find the highest bracket whose `over` is <= annualGross
  let bracket = table[0]!;
  for (const b of table) {
    if (annualGross >= b.over) bracket = b;
    else break;
  }
  const annualTax = bracket.flatAmount + (annualGross - bracket.over) * bracket.marginalRate;
  const periodTax = Math.max(0, annualTax / periodsPerYear);
  const cents = BigInt(Math.round(periodTax * 100));
  return cents + (args.extraWithholdingCents ?? 0n);
}

/**
 * State withholding by jurisdiction. Phase 1 covers a few common states;
 * falls back to a flat 4% placeholder elsewhere.
 *
 * Values are simplified flat / single-bracket rates intended as a starting
 * point — they will be replaced with proper state percentage tables as we
 * onboard customers in each state.
 */
const STATE_FLAT_RATES: Record<string, number> = {
  CA: 0.06, // simplified placeholder — real CA uses brackets + LIT
  NY: 0.0625,
  TX: 0, // no state income tax
  FL: 0,
  WA: 0,
  NV: 0,
  TN: 0,
  WY: 0,
  SD: 0,
  AK: 0,
  NH: 0,
  IL: 0.0495,
  PA: 0.0307,
  CO: 0.044,
  MI: 0.0425,
  IN: 0.0315,
  GA: 0.0539,
  AZ: 0.025,
  NC: 0.0425,
  MA: 0.05,
  OH: 0.0275,
  VA: 0.0575,
  MN: 0.0535,
};

export function computeStateIncomeTaxCents(args: {
  grossCents: bigint;
  state?: string | null;
}): bigint {
  const code = (args.state ?? "").toUpperCase();
  const rate = (code in STATE_FLAT_RATES ? STATE_FLAT_RATES[code] : 0.04) ?? 0.04;
  if (rate === 0) return 0n;
  const cents = Number(args.grossCents) * rate;
  return BigInt(Math.round(cents));
}

export function computeSocialSecurityCents(args: {
  grossCents: bigint;
  ytdSocialSecurityWagesCents: bigint;
}): bigint {
  const remainingBase = SS_WAGE_BASE_CENTS_2026 - args.ytdSocialSecurityWagesCents;
  if (remainingBase <= 0n) return 0n;
  const taxableThisCheck = args.grossCents < remainingBase ? args.grossCents : remainingBase;
  return BigInt(Math.round(Number(taxableThisCheck) * SS_RATE));
}

export function computeMedicareCents(grossCents: bigint): bigint {
  return BigInt(Math.round(Number(grossCents) * MEDICARE_RATE));
}

export interface Withholding {
  federalCents: bigint;
  stateCents: bigint;
  socialSecurityCents: bigint;
  medicareCents: bigint;
  totalCents: bigint;
  netCents: bigint;
}

/**
 * Compute total withholding for a single paycheck.
 */
export function computeWithholding(args: {
  grossCents: bigint;
  filingStatus: FilingStatus;
  cadence: PayCadence;
  state?: string | null;
  ytdSocialSecurityWagesCents: bigint;
  extraWithholdingCents?: bigint;
}): Withholding {
  const fed = computeFederalIncomeTaxCents({
    grossCents: args.grossCents,
    filingStatus: args.filingStatus,
    cadence: args.cadence,
    extraWithholdingCents: args.extraWithholdingCents,
  });
  const state = computeStateIncomeTaxCents({ grossCents: args.grossCents, state: args.state });
  const ss = computeSocialSecurityCents({
    grossCents: args.grossCents,
    ytdSocialSecurityWagesCents: args.ytdSocialSecurityWagesCents,
  });
  const med = computeMedicareCents(args.grossCents);
  const total = fed + state + ss + med;
  return {
    federalCents: fed,
    stateCents: state,
    socialSecurityCents: ss,
    medicareCents: med,
    totalCents: total,
    netCents: args.grossCents - total,
  };
}
