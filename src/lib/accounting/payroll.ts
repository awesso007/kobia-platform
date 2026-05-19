/**
 * Payroll engine — minimal first cut (Cycle 5 W2-W3).
 *
 * createDraftPayRun:
 *   - Builds paystubs for every active employee in the entity for a given period.
 *   - For SALARY: gross = annualPayRateCents * periodFractionOfYear
 *     (default 1/26 — biweekly). Caller can override periodFraction.
 *   - For HOURLY: pulls unbilled TimeEntry rows in [periodStart, periodEnd];
 *     regular = hourlyRate * regHours; overtime = hourlyRate * 1.5 * otHours.
 *     Stamps each TimeEntry with the new paystubId.
 *   - CONTRACTOR: skipped (they get bills, not paystubs).
 *
 * Tax withholding placeholder: a flat estimate (federal 12%, state 4%, SS 6.2%,
 * Medicare 1.45%) — the real engine lands in Cycle 5 W3. Editable per paystub
 * later.
 *
 * postPayRun:
 *   - Sums gross, taxes, net across all paystubs.
 *   - Posts JE on payDate:
 *       DR Wages & Salaries Expense    totalGross
 *       DR Payroll Tax Expense         employerTaxes (SS + Medicare matched)
 *         CR Payroll Tax Liabilities   totalEmployeeTaxes + employerTaxes
 *         CR Cash / Operating Account  totalNet
 *   - Stamps the PayRun.journalEntryId, marks status POSTED.
 */
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { postJournalEntry, type DraftEntry } from "./ledger";

const WAGES_CODE = "6100";
const WAGES_NAME = "Wages & Salaries Expense";
const PR_TAX_EXPENSE_CODE = "6110";
const PR_TAX_EXPENSE_NAME = "Payroll Tax Expense";
const PR_TAX_LIAB_CODE = "2100";
const PR_TAX_LIAB_NAME = "Payroll Tax Liabilities";
const CASH_CODE = "1000";

async function ensureAccount(args: {
  tenantId: string;
  entityId: string;
  code: string;
  name: string;
  type: "EXPENSE" | "LIABILITY" | "ASSET";
  client?: Prisma.TransactionClient | typeof db;
}) {
  const c = args.client ?? db;
  const existing = await c.account.findFirst({
    where: { entityId: args.entityId, code: args.code },
  });
  if (existing) return existing;
  return c.account.create({
    data: {
      tenantId: args.tenantId,
      entityId: args.entityId,
      code: args.code,
      name: args.name,
      type: args.type,
      subtype: args.type === "EXPENSE" ? "Payroll" : args.type === "LIABILITY" ? "Payroll Liabilities" : "Bank",
      isActive: true,
    },
  });
}

async function findCashAccount(args: { tenantId: string; entityId: string }) {
  // Prefer a bank-linked Asset account, otherwise the canonical "1000 Cash" account.
  const bank = await db.account.findFirst({
    where: {
      entityId: args.entityId,
      type: "ASSET",
      isActive: true,
      OR: [
        { subtype: { contains: "Bank", mode: "insensitive" } },
        { code: CASH_CODE },
      ],
    },
    orderBy: { code: "asc" },
  });
  if (bank) return bank;
  return ensureAccount({
    tenantId: args.tenantId,
    entityId: args.entityId,
    code: CASH_CODE,
    name: "Cash",
    type: "ASSET",
  });
}

// Default placeholder withholding rates — replaced by real engine in W3.
const FED_RATE = 0.12;
const STATE_RATE = 0.04;
const SS_RATE = 0.062;
const MEDICARE_RATE = 0.0145;

function applyWithholding(grossCents: bigint) {
  const g = Number(grossCents);
  const fed = BigInt(Math.round(g * FED_RATE));
  const state = BigInt(Math.round(g * STATE_RATE));
  const ss = BigInt(Math.round(g * SS_RATE));
  const med = BigInt(Math.round(g * MEDICARE_RATE));
  const total = fed + state + ss + med;
  const net = grossCents - total;
  return { fed, state, ss, med, total, net };
}

export interface CreatePayRunInput {
  tenantId: string;
  entityId: string;
  periodStart: Date;
  periodEnd: Date;
  payDate: Date;
  /** Fraction of a year this period covers, used for SALARY. Default 1/26 (biweekly). */
  periodFractionOfYear?: number;
}

export async function createDraftPayRun(input: CreatePayRunInput) {
  const periodFrac = input.periodFractionOfYear ?? 1 / 26;

  return db.$transaction(async (tx) => {
    const employees = await tx.employee.findMany({
      where: {
        tenantId: input.tenantId,
        entityId: input.entityId,
        isActive: true,
        payType: { in: ["SALARY", "HOURLY"] },
      },
    });

    const payRun = await tx.payRun.create({
      data: {
        tenantId: input.tenantId,
        entityId: input.entityId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        payDate: input.payDate,
        status: "DRAFT",
      },
    });

    let totalGross = 0n;
    let totalTaxes = 0n;
    let totalNet = 0n;

    for (const e of employees) {
      let regHoursMilli = 0n;
      let otHoursMilli = 0n;
      let regPay = 0n;
      let otPay = 0n;

      if (e.payType === "SALARY") {
        const annual = Number(e.payRateCents);
        regPay = BigInt(Math.round(annual * periodFrac));
      } else if (e.payType === "HOURLY") {
        // Pull unbilled time entries in window
        const entries = await tx.timeEntry.findMany({
          where: {
            tenantId: input.tenantId,
            employeeId: e.id,
            paystubId: null,
            workDate: { gte: input.periodStart, lte: input.periodEnd },
          },
        });
        const rate = Number(e.payRateCents);
        for (const t of entries) {
          if (t.isOvertime) {
            otHoursMilli += t.hoursMilli;
            otPay += BigInt(Math.round((Number(t.hoursMilli) / 1000) * rate * 1.5));
          } else {
            regHoursMilli += t.hoursMilli;
            regPay += BigInt(Math.round((Number(t.hoursMilli) / 1000) * rate));
          }
        }
      }

      const gross = regPay + otPay;
      if (gross === 0n) continue; // skip employees with no pay this period
      const w = applyWithholding(gross);

      const paystub = await tx.paystub.create({
        data: {
          tenantId: input.tenantId,
          payRunId: payRun.id,
          employeeId: e.id,
          regularHoursMilli: regHoursMilli,
          overtimeHoursMilli: otHoursMilli,
          regularPayCents: regPay,
          overtimePayCents: otPay,
          grossCents: gross,
          federalTaxCents: w.fed,
          stateTaxCents: w.state,
          socialSecurityCents: w.ss,
          medicareCents: w.med,
          netCents: w.net,
        },
      });

      // Stamp the time entries that fed this paystub (HOURLY only)
      if (e.payType === "HOURLY") {
        await tx.timeEntry.updateMany({
          where: {
            tenantId: input.tenantId,
            employeeId: e.id,
            paystubId: null,
            workDate: { gte: input.periodStart, lte: input.periodEnd },
          },
          data: { paystubId: paystub.id },
        });
      }

      totalGross += gross;
      totalTaxes += w.total;
      totalNet += w.net;
    }

    return tx.payRun.update({
      where: { id: payRun.id },
      data: {
        totalGrossCents: totalGross,
        totalTaxesCents: totalTaxes,
        totalNetCents: totalNet,
      },
      include: { paystubs: { include: { employee: true } } },
    });
  });
}

export async function postPayRun(args: {
  payRunId: string;
  tenantId: string;
  entityId: string;
  postedByUserId?: string;
}) {
  const pr = await db.payRun.findFirst({
    where: { id: args.payRunId, tenantId: args.tenantId, entityId: args.entityId },
    include: { paystubs: true },
  });
  if (!pr) throw new Error("Pay run not found");
  if (pr.status !== "DRAFT") throw new Error(`Pay run is ${pr.status}, not DRAFT`);
  if (pr.paystubs.length === 0) throw new Error("Pay run has no paystubs");

  const wagesAcct = await ensureAccount({
    tenantId: args.tenantId,
    entityId: args.entityId,
    code: WAGES_CODE,
    name: WAGES_NAME,
    type: "EXPENSE",
  });
  const prTaxExpAcct = await ensureAccount({
    tenantId: args.tenantId,
    entityId: args.entityId,
    code: PR_TAX_EXPENSE_CODE,
    name: PR_TAX_EXPENSE_NAME,
    type: "EXPENSE",
  });
  const prTaxLiabAcct = await ensureAccount({
    tenantId: args.tenantId,
    entityId: args.entityId,
    code: PR_TAX_LIAB_CODE,
    name: PR_TAX_LIAB_NAME,
    type: "LIABILITY",
  });
  const cashAcct = await findCashAccount({ tenantId: args.tenantId, entityId: args.entityId });

  // Employer-side FICA match: SS 6.2% + Medicare 1.45% of gross
  const employerSS = BigInt(Math.round(Number(pr.totalGrossCents) * SS_RATE));
  const employerMed = BigInt(Math.round(Number(pr.totalGrossCents) * MEDICARE_RATE));
  const employerTaxes = employerSS + employerMed;

  const totalLiab = pr.totalTaxesCents + employerTaxes;

  const draft: DraftEntry = {
    tenantId: args.tenantId,
    entityId: args.entityId,
    entryDate: pr.payDate,
    description: `Payroll \u2014 ${pr.periodStart.toISOString().slice(0, 10)} to ${pr.periodEnd.toISOString().slice(0, 10)}`,
    source: "PAYROLL",
    sourceRefId: pr.id,
    lines: [
      { accountId: wagesAcct.id, debitCents: pr.totalGrossCents, creditCents: 0n },
      { accountId: prTaxExpAcct.id, debitCents: employerTaxes, creditCents: 0n },
      { accountId: prTaxLiabAcct.id, debitCents: 0n, creditCents: totalLiab },
      { accountId: cashAcct.id, debitCents: 0n, creditCents: pr.totalNetCents },
    ],
  };

  const je = await postJournalEntry(draft, { postedByUserId: args.postedByUserId });

  return db.payRun.update({
    where: { id: pr.id },
    data: {
      status: "POSTED",
      journalEntryId: je.id,
      postedAt: new Date(),
      postedByUserId: args.postedByUserId,
    },
  });
}

export async function voidPayRun(args: { payRunId: string; tenantId: string; entityId: string }) {
  const pr = await db.payRun.findFirst({
    where: { id: args.payRunId, tenantId: args.tenantId, entityId: args.entityId },
  });
  if (!pr) throw new Error("Pay run not found");
  if (pr.status === "POSTED") {
    throw new Error("Cannot void a posted pay run \u2014 reverse the JE first");
  }
  // Unstamp time entries linked to this pay run's paystubs
  const paystubs = await db.paystub.findMany({ where: { payRunId: pr.id }, select: { id: true } });
  const stubIds = paystubs.map((p) => p.id);
  if (stubIds.length > 0) {
    await db.timeEntry.updateMany({
      where: { paystubId: { in: stubIds } },
      data: { paystubId: null },
    });
    await db.paystub.deleteMany({ where: { payRunId: pr.id } });
  }
  return db.payRun.update({ where: { id: pr.id }, data: { status: "VOID" } });
}
