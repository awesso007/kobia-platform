/**
 * Mileage tracking — books a business-use deduction at the IRS standard rate.
 *
 * Posts a journal entry:
 *   DR  Auto/Mileage Expense       expenseCents
 *     CR  Owner contributions       expenseCents
 *
 * Logic:
 *   - Look up (or create on demand) the entity's "Auto/Mileage Expense" account
 *     and "Owner contributions" equity account.
 *   - expenseCents = round(miles * (businessPercent / 100) * ratePerMileCents)
 *
 * Storage is a Decimal(8,2) for miles; we accept number in callers and convert.
 */
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { postJournalEntry } from "./ledger";

const MILEAGE_ACCOUNT_CODE = "6210";
const MILEAGE_ACCOUNT_NAME = "Auto & Mileage Expense";
const OWNER_CONTRIBUTIONS_CODE = "3100";
const OWNER_CONTRIBUTIONS_NAME = "Owner Contributions";

export function computeExpenseCents(
  miles: number,
  businessPercent: number,
  ratePerMileCents: number,
): bigint {
  const m = Number(miles);
  const pct = Math.min(100, Math.max(0, Number(businessPercent)));
  const r = Number(ratePerMileCents);
  const cents = Math.round((m * pct * r) / 100);
  return BigInt(cents);
}

async function ensureAccount(args: {
  tenantId: string;
  entityId: string;
  code: string;
  name: string;
  type: "EXPENSE" | "EQUITY";
}) {
  const existing = await db.account.findFirst({
    where: { entityId: args.entityId, code: args.code },
  });
  if (existing) return existing;
  return db.account.create({
    data: {
      tenantId: args.tenantId,
      entityId: args.entityId,
      code: args.code,
      name: args.name,
      type: args.type,
      subtype: args.type === "EXPENSE" ? "Auto & Travel" : "Owner Equity",
      isActive: true,
    },
  });
}

export interface CreateMileageInput {
  tenantId: string;
  entityId: string;
  tripDate: Date;
  miles: number;
  ratePerMileCents?: number;
  businessPercent?: number;
  fromAddress?: string | null;
  toAddress?: string | null;
  purpose?: string | null;
  createdByUserId?: string;
}

export async function createDraftMileage(input: CreateMileageInput) {
  const ratePerMileCents = input.ratePerMileCents ?? 70;
  const businessPercent = input.businessPercent ?? 100;
  const expenseCents = computeExpenseCents(input.miles, businessPercent, ratePerMileCents);

  return db.mileage.create({
    data: {
      tenantId: input.tenantId,
      entityId: input.entityId,
      tripDate: input.tripDate,
      miles: new Prisma.Decimal(input.miles.toFixed(2)),
      ratePerMileCents,
      businessPercent,
      fromAddress: input.fromAddress ?? null,
      toAddress: input.toAddress ?? null,
      purpose: input.purpose ?? null,
      expenseCents,
      status: "DRAFT",
      createdByUserId: input.createdByUserId,
    },
  });
}

export async function postMileage(args: {
  mileageId: string;
  tenantId: string;
  entityId: string;
  postedByUserId?: string;
}) {
  const m = await db.mileage.findFirst({
    where: { id: args.mileageId, tenantId: args.tenantId, entityId: args.entityId },
  });
  if (!m) throw new Error("Mileage entry not found");
  if (m.status !== "DRAFT") throw new Error(`Mileage already ${m.status.toLowerCase()}`);

  const expenseAcct = await ensureAccount({
    tenantId: args.tenantId,
    entityId: args.entityId,
    code: MILEAGE_ACCOUNT_CODE,
    name: MILEAGE_ACCOUNT_NAME,
    type: "EXPENSE",
  });
  const ownerAcct = await ensureAccount({
    tenantId: args.tenantId,
    entityId: args.entityId,
    code: OWNER_CONTRIBUTIONS_CODE,
    name: OWNER_CONTRIBUTIONS_NAME,
    type: "EQUITY",
  });

  const description = `Mileage: ${m.miles.toString()} mi @ ${m.ratePerMileCents}\u00a2/mi${
    m.businessPercent === 100 ? "" : ` (${m.businessPercent}% business)`
  }${m.purpose ? ` \u2014 ${m.purpose}` : ""}`;

  const je = await postJournalEntry(
    {
      tenantId: args.tenantId,
      entityId: args.entityId,
      entryDate: m.tripDate,
      description,
      source: "MANUAL",
      sourceRefId: m.id,
      lines: [
        { accountId: expenseAcct.id, debitCents: m.expenseCents, creditCents: 0n },
        { accountId: ownerAcct.id, debitCents: 0n, creditCents: m.expenseCents },
      ],
    },
    { postedByUserId: args.postedByUserId },
  );

  return db.mileage.update({
    where: { id: m.id },
    data: { status: "POSTED", journalEntryId: je.id },
  });
}

export async function voidMileage(args: {
  mileageId: string;
  tenantId: string;
  entityId: string;
}) {
  const m = await db.mileage.findFirst({
    where: { id: args.mileageId, tenantId: args.tenantId, entityId: args.entityId },
  });
  if (!m) throw new Error("Mileage entry not found");
  // If posted, the JE remains (auditability). UI hides void entries from totals.
  return db.mileage.update({ where: { id: m.id }, data: { status: "VOID" } });
}
