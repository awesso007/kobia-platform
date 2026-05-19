/**
 * Fixed asset depreciation engine.
 *
 * Method: STRAIGHT_LINE only for now.
 *   monthlyDepreciation = (costCents - salvageValueCents) / usefulLifeMonths
 *   The first and last month are NOT prorated — assets in service mid-month get a full month
 *   (matching common CPA practice; configurable later).
 *
 * Posting:
 *   Each month: DR Depreciation Expense, CR Accumulated Depreciation.
 *   One JournalEntry per (asset, month). Idempotent via @@unique([fixedAssetId, periodStart]).
 */
import { db } from "@/lib/db";
import { postJournalEntry } from "./ledger";
import { monthStart, monthEnd, monthLabel, ensureMonthlyPeriod } from "./periods";

export class DepreciationError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "DepreciationError";
  }
}

/** Monthly straight-line depreciation amount (rounded down to whole cents). */
export function monthlyStraightLine(
  costCents: bigint,
  salvageCents: bigint,
  usefulLifeMonths: number
): bigint {
  if (usefulLifeMonths <= 0) return 0n;
  const depBase = costCents - salvageCents;
  if (depBase <= 0n) return 0n;
  return depBase / BigInt(usefulLifeMonths); // BigInt floor division
}

/**
 * Build the full depreciation schedule (no DB writes).
 * Returns an array of months with cumulative + book-value figures.
 * The final month gets a rounding adjustment so the schedule fully exhausts depBase.
 */
export type ScheduleRow = {
  monthIdx: number; // 1-based
  periodStart: Date;
  periodEnd: Date;
  label: string;
  monthlyCents: bigint;
  accumulatedCents: bigint;
  bookValueCents: bigint;
};

export function buildSchedule(asset: {
  acquisitionDate: Date;
  costCents: bigint;
  salvageValueCents: bigint;
  usefulLifeMonths: number;
}): ScheduleRow[] {
  const monthly = monthlyStraightLine(asset.costCents, asset.salvageValueCents, asset.usefulLifeMonths);
  const depBase = asset.costCents - asset.salvageValueCents;

  const rows: ScheduleRow[] = [];
  let accumulated = 0n;

  const startYear = asset.acquisitionDate.getUTCFullYear();
  const startMonth = asset.acquisitionDate.getUTCMonth();

  for (let i = 0; i < asset.usefulLifeMonths; i++) {
    const y = startYear + Math.floor((startMonth + i) / 12);
    const m = (startMonth + i) % 12;
    const ps = monthStart(y, m);
    const pe = monthEnd(y, m);
    let amt = monthly;
    if (i === asset.usefulLifeMonths - 1) {
      // Final month: take the remainder so we exactly hit depBase.
      amt = depBase - accumulated;
      if (amt < 0n) amt = 0n;
    }
    accumulated += amt;
    rows.push({
      monthIdx: i + 1,
      periodStart: ps,
      periodEnd: pe,
      label: monthLabel(y, m),
      monthlyCents: amt,
      accumulatedCents: accumulated,
      bookValueCents: asset.costCents - accumulated,
    });
  }

  return rows;
}

/** Sum of depreciation already posted for this asset. */
export async function totalPostedFor(fixedAssetId: string): Promise<bigint> {
  const result = await db.depreciationEntry.aggregate({
    where: { fixedAssetId },
    _sum: { amountCents: true },
  });
  return (result._sum.amountCents as bigint | null) ?? 0n;
}

/**
 * Post depreciation for a specific month. Idempotent — returns existing entry if already posted.
 * Caps the amount at remaining depreciable base so we never over-depreciate.
 */
export async function postDepreciationForMonth(input: {
  fixedAssetId: string;
  year: number;
  monthIdx: number; // 0-11
  postedByUserId?: string;
}) {
  const asset = await db.fixedAsset.findUnique({ where: { id: input.fixedAssetId } });
  if (!asset) throw new DepreciationError("NOT_FOUND", "Fixed asset not found.");
  if (asset.status === "DISPOSED") {
    throw new DepreciationError("DISPOSED", "Asset is disposed — cannot post depreciation.");
  }

  const periodStart = monthStart(input.year, input.monthIdx);
  const periodEnd = monthEnd(input.year, input.monthIdx);

  // Acquisition guard — never depreciate before the asset is in service.
  const acqMonthStart = monthStart(
    asset.acquisitionDate.getUTCFullYear(),
    asset.acquisitionDate.getUTCMonth()
  );
  if (periodStart < acqMonthStart) {
    throw new DepreciationError(
      "BEFORE_SERVICE",
      `Cannot depreciate before ${monthLabel(asset.acquisitionDate.getUTCFullYear(), asset.acquisitionDate.getUTCMonth())}.`
    );
  }

  // Idempotency
  const existing = await db.depreciationEntry.findUnique({
    where: { fixedAssetId_periodStart: { fixedAssetId: asset.id, periodStart } },
    include: { fixedAsset: false },
  });
  if (existing) return { entryId: existing.journalEntryId, alreadyPosted: true, amountCents: existing.amountCents };

  // Schedule-driven amount for this row
  const schedule = buildSchedule(asset);
  const row = schedule.find(
    (r) => r.periodStart.getTime() === periodStart.getTime()
  );
  if (!row) {
    throw new DepreciationError(
      "OUT_OF_SCHEDULE",
      `${monthLabel(input.year, input.monthIdx)} is past the asset's useful life.`
    );
  }

  // Defensive cap: never depreciate past depreciable base
  const posted = await totalPostedFor(asset.id);
  const depBase = asset.costCents - asset.salvageValueCents;
  const remaining = depBase - posted;
  let amount = row.monthlyCents;
  if (amount > remaining) amount = remaining;
  if (amount <= 0n) {
    throw new DepreciationError("FULLY_DEPRECIATED", "Asset is fully depreciated.");
  }

  // Ensure the period exists (so close workflow can lock later if needed)
  await ensureMonthlyPeriod(asset.tenantId, asset.entityId, input.year, input.monthIdx);

  // Post the JE and the link record transactionally
  const result = await db.$transaction(async (tx) => {
    const je = await postJournalEntry(
      {
        tenantId: asset.tenantId,
        entityId: asset.entityId,
        entryDate: periodEnd,
        description: `Depreciation — ${asset.name} — ${monthLabel(input.year, input.monthIdx)}`,
        source: "DEPRECIATION",
        sourceRefId: asset.id,
        lines: [
          {
            accountId: asset.depreciationExpenseAccountId,
            debitCents: amount,
            creditCents: 0n,
          },
          {
            accountId: asset.accumulatedDepreciationAccountId,
            debitCents: 0n,
            creditCents: amount,
          },
        ],
      },
      { postedByUserId: input.postedByUserId, client: tx }
    );

    const dep = await tx.depreciationEntry.create({
      data: {
        tenantId: asset.tenantId,
        fixedAssetId: asset.id,
        periodStart,
        periodEnd,
        amountCents: amount,
        journalEntryId: je.id,
        postedByUserId: input.postedByUserId,
      },
    });

    // Mark fully depreciated when we hit the base
    const newPosted = posted + amount;
    if (newPosted >= depBase) {
      await tx.fixedAsset.update({
        where: { id: asset.id },
        data: { status: "FULLY_DEPRECIATED" },
      });
    }

    return { entryId: je.id, depreciationEntryId: dep.id, amountCents: amount, alreadyPosted: false };
  });

  return result;
}

/**
 * Post depreciation for every ACTIVE asset for a given month.
 * Returns a summary of what was posted vs. skipped.
 */
export async function postMonthlyDepreciationForEntity(input: {
  entityId: string;
  year: number;
  monthIdx: number;
  postedByUserId?: string;
}) {
  const assets = await db.fixedAsset.findMany({
    where: { entityId: input.entityId, status: "ACTIVE" },
  });

  const results: Array<{ assetId: string; assetName: string; outcome: string; amountCents?: bigint }> = [];

  for (const a of assets) {
    try {
      const r = await postDepreciationForMonth({
        fixedAssetId: a.id,
        year: input.year,
        monthIdx: input.monthIdx,
        postedByUserId: input.postedByUserId,
      });
      results.push({
        assetId: a.id,
        assetName: a.name,
        outcome: r.alreadyPosted ? "already_posted" : "posted",
        amountCents: r.amountCents,
      });
    } catch (err) {
      const code = err instanceof DepreciationError ? err.code : "ERROR";
      results.push({ assetId: a.id, assetName: a.name, outcome: code.toLowerCase() });
    }
  }

  return results;
}
