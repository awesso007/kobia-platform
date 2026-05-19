import { db } from "@/lib/db";

/**
 * Year-end and quarterly federal payroll-form aggregations.
 * All amounts are computed from POSTED paystubs in the requested period.
 */

export interface W2Totals {
  wagesCents: bigint;           // Box 1: federal wages
  federalTaxCents: bigint;      // Box 2: federal income tax withheld
  ssWagesCents: bigint;         // Box 3: SS wages (capped at base)
  ssTaxCents: bigint;           // Box 4: SS tax withheld
  medicareWagesCents: bigint;   // Box 5: medicare wages
  medicareTaxCents: bigint;     // Box 6: medicare tax withheld
  stateWagesCents: bigint;      // Box 16
  stateTaxCents: bigint;        // Box 17
}

export interface W2ForEmployee {
  employeeId: string;
  firstName: string;
  lastName: string;
  ssnLast4: string | null;
  homeAddress: string | null;
  totals: W2Totals;
}

/** Aggregate W-2 totals for one employee for a given calendar year. */
export async function getW2ForEmployee(args: {
  tenantId: string;
  entityId: string;
  employeeId: string;
  year: number;
}): Promise<W2ForEmployee | null> {
  const employee = await db.employee.findFirst({
    where: { id: args.employeeId, tenantId: args.tenantId, entityId: args.entityId },
  });
  if (!employee) return null;

  const start = new Date(Date.UTC(args.year, 0, 1));
  const end = new Date(Date.UTC(args.year + 1, 0, 1));

  const paystubs = await db.paystub.findMany({
    where: {
      tenantId: args.tenantId,
      employeeId: args.employeeId,
      payRun: {
        status: "POSTED",
        entityId: args.entityId,
        payDate: { gte: start, lt: end },
      },
    },
  });

  const totals: W2Totals = {
    wagesCents: 0n,
    federalTaxCents: 0n,
    ssWagesCents: 0n,
    ssTaxCents: 0n,
    medicareWagesCents: 0n,
    medicareTaxCents: 0n,
    stateWagesCents: 0n,
    stateTaxCents: 0n,
  };

  for (const p of paystubs) {
    totals.wagesCents += p.grossCents;
    totals.federalTaxCents += p.federalTaxCents;
    // SS wages = gross that was subject to SS (derive from SS tax / 6.2%)
    if (p.socialSecurityCents > 0n) {
      // Reverse: ssWages = ssTax / 0.062. Use BigInt math via cents-of-cents.
      const ssWages = (p.socialSecurityCents * 1000n) / 62n;
      totals.ssWagesCents += ssWages;
    }
    totals.ssTaxCents += p.socialSecurityCents;
    totals.medicareWagesCents += p.grossCents;
    totals.medicareTaxCents += p.medicareCents;
    totals.stateWagesCents += p.grossCents;
    totals.stateTaxCents += p.stateTaxCents;
  }

  return {
    employeeId: employee.id,
    firstName: employee.firstName,
    lastName: employee.lastName,
    ssnLast4: employee.ssnLast4,
    homeAddress: employee.homeAddress,
    totals,
  };
}

/** Aggregate W-2 totals across every employee with posted paystubs for a year. */
export async function listW2sForYear(args: {
  tenantId: string;
  entityId: string;
  year: number;
}): Promise<W2ForEmployee[]> {
  const start = new Date(Date.UTC(args.year, 0, 1));
  const end = new Date(Date.UTC(args.year + 1, 0, 1));

  const paystubs = await db.paystub.findMany({
    where: {
      tenantId: args.tenantId,
      payRun: {
        status: "POSTED",
        entityId: args.entityId,
        payDate: { gte: start, lt: end },
      },
    },
    select: { employeeId: true },
  });

  const empIds = Array.from(new Set(paystubs.map((p) => p.employeeId)));
  const results = await Promise.all(
    empIds.map((id) => getW2ForEmployee({ ...args, employeeId: id })),
  );
  return results.filter((w): w is W2ForEmployee => w !== null);
}

export interface F941Totals {
  year: number;
  quarter: 1 | 2 | 3 | 4;
  employeeCount: number;
  wagesCents: bigint;           // Line 2: wages, tips, and other compensation
  federalTaxCents: bigint;      // Line 3: federal income tax withheld
  ssWagesCents: bigint;         // Line 5a col 1
  ssTaxCents: bigint;           // Line 5a col 2 (employee + employer = wages * 12.4%)
  medicareWagesCents: bigint;   // Line 5c col 1
  medicareTaxCents: bigint;     // Line 5c col 2 (employee + employer = wages * 2.9%)
  totalLiabilityCents: bigint;  // Line 12: fed income tax + SS (×2) + Medicare (×2)
}

/** Aggregate Form 941 totals for one quarter. */
export async function getF941ForQuarter(args: {
  tenantId: string;
  entityId: string;
  year: number;
  quarter: 1 | 2 | 3 | 4;
}): Promise<F941Totals> {
  const startMonth = (args.quarter - 1) * 3;
  const start = new Date(Date.UTC(args.year, startMonth, 1));
  const end = new Date(Date.UTC(args.year, startMonth + 3, 1));

  const paystubs = await db.paystub.findMany({
    where: {
      tenantId: args.tenantId,
      payRun: {
        status: "POSTED",
        entityId: args.entityId,
        payDate: { gte: start, lt: end },
      },
    },
  });

  let wagesCents = 0n;
  let federalTaxCents = 0n;
  let employeeSsTaxCents = 0n;
  let employeeMedicareCents = 0n;
  const empSet = new Set<string>();
  for (const p of paystubs) {
    empSet.add(p.employeeId);
    wagesCents += p.grossCents;
    federalTaxCents += p.federalTaxCents;
    employeeSsTaxCents += p.socialSecurityCents;
    employeeMedicareCents += p.medicareCents;
  }

  // SS wages (subject) derived from employee SS tax / 6.2%
  const ssWagesCents = (employeeSsTaxCents * 1000n) / 62n;
  const ssTaxCents = employeeSsTaxCents * 2n;          // employee + matching employer
  const medicareTaxCents = employeeMedicareCents * 2n; // employee + matching employer

  const totalLiabilityCents =
    federalTaxCents + ssTaxCents + medicareTaxCents;

  return {
    year: args.year,
    quarter: args.quarter,
    employeeCount: empSet.size,
    wagesCents,
    federalTaxCents,
    ssWagesCents,
    ssTaxCents,
    medicareWagesCents: wagesCents,
    medicareTaxCents,
    totalLiabilityCents,
  };
}

/** Form 940 (FUTA) — annual unemployment tax summary. */
export interface F940Totals {
  year: number;
  employeeCount: number;
  totalWagesCents: bigint;
  futaWagesCents: bigint;       // capped at $7,000 per employee
  futaTaxCents: bigint;         // 0.6% effective rate (after state credit)
}

const FUTA_WAGE_BASE_CENTS = 700_000n; // $7,000 per employee
const FUTA_EFFECTIVE_RATE_BPS = 60n;   // 0.6% in basis points

export async function getF940ForYear(args: {
  tenantId: string;
  entityId: string;
  year: number;
}): Promise<F940Totals> {
  const start = new Date(Date.UTC(args.year, 0, 1));
  const end = new Date(Date.UTC(args.year + 1, 0, 1));

  const paystubs = await db.paystub.findMany({
    where: {
      tenantId: args.tenantId,
      payRun: {
        status: "POSTED",
        entityId: args.entityId,
        payDate: { gte: start, lt: end },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const perEmp = new Map<string, bigint>();
  let totalWages = 0n;
  for (const p of paystubs) {
    totalWages += p.grossCents;
    perEmp.set(p.employeeId, (perEmp.get(p.employeeId) ?? 0n) + p.grossCents);
  }

  let futaWages = 0n;
  for (const wages of perEmp.values()) {
    futaWages += wages > FUTA_WAGE_BASE_CENTS ? FUTA_WAGE_BASE_CENTS : wages;
  }
  const futaTax = (futaWages * FUTA_EFFECTIVE_RATE_BPS) / 10_000n;

  return {
    year: args.year,
    employeeCount: perEmp.size,
    totalWagesCents: totalWages,
    futaWagesCents: futaWages,
    futaTaxCents: futaTax,
  };
}
