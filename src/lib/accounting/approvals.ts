/**
 * Bill approval workflow.
 *
 * Rules per entity: if a bill totals exceeds `thresholdCents` and the rule is enabled,
 * the bill goes to PENDING_APPROVAL instead of being posted directly. An OWNER or ADMIN
 * approves → bill is posted via postBill(). Rejection sends it back to DRAFT.
 */
import { db } from "@/lib/db";
import { postBill } from "@/lib/accounting/ap";

export interface ApprovalCheck {
  required: boolean;
  thresholdCents: bigint;
  totalCents: bigint;
}

/**
 * Decide whether a bill requires approval before posting.
 * Returns { required: false } when no rule is configured, the rule is disabled,
 * or the bill amount is at/below threshold.
 */
export async function checkBillApprovalRequired(args: {
  tenantId: string;
  entityId: string;
  totalCents: bigint;
}): Promise<ApprovalCheck> {
  const rule = await db.approvalRule.findUnique({
    where: { entityId: args.entityId },
  });
  if (!rule || !rule.isEnabled) {
    return { required: false, thresholdCents: 0n, totalCents: args.totalCents };
  }
  return {
    required: args.totalCents > rule.thresholdCents,
    thresholdCents: rule.thresholdCents,
    totalCents: args.totalCents,
  };
}

/**
 * Move a DRAFT bill into PENDING_APPROVAL. Creates a BillApproval audit record.
 */
export async function submitBillForApproval(args: {
  tenantId: string;
  billId: string;
  submittedByUserId: string;
}) {
  const bill = await db.bill.findUnique({
    where: { id: args.billId },
  });
  if (!bill) throw new Error("Bill not found");
  if (bill.status !== "DRAFT" && bill.status !== "REJECTED") {
    throw new Error(`Bill is ${bill.status}, cannot submit for approval`);
  }

  return db.$transaction(async (tx) => {
    await tx.bill.update({
      where: { id: bill.id },
      data: { status: "PENDING_APPROVAL" },
    });
    await tx.billApproval.create({
      data: {
        tenantId: args.tenantId,
        billId: bill.id,
        submittedById: args.submittedByUserId,
      },
    });
  });
}

/**
 * Approve a PENDING_APPROVAL bill and post it to the ledger.
 */
export async function approveBill(args: {
  tenantId: string;
  billId: string;
  decidedByUserId: string;
  note?: string;
}) {
  const bill = await db.bill.findUnique({ where: { id: args.billId } });
  if (!bill) throw new Error("Bill not found");
  if (bill.status !== "PENDING_APPROVAL") {
    throw new Error(`Bill is ${bill.status}, not PENDING_APPROVAL`);
  }

  // Find the latest pending approval row and stamp it.
  const pending = await db.billApproval.findFirst({
    where: { billId: bill.id, decision: null },
    orderBy: { submittedAt: "desc" },
  });

  // Flip status to DRAFT first so postBill's invariant holds.
  await db.bill.update({
    where: { id: bill.id },
    data: { status: "DRAFT" },
  });

  // Post it.
  await postBill(bill.id, { postedByUserId: args.decidedByUserId });

  if (pending) {
    await db.billApproval.update({
      where: { id: pending.id },
      data: {
        decision: "APPROVED",
        decidedById: args.decidedByUserId,
        decidedAt: new Date(),
        note: args.note,
      },
    });
  }
}

/**
 * Reject a PENDING_APPROVAL bill. Status moves to REJECTED so the submitter can edit/resubmit.
 */
export async function rejectBill(args: {
  tenantId: string;
  billId: string;
  decidedByUserId: string;
  note?: string;
}) {
  const bill = await db.bill.findUnique({ where: { id: args.billId } });
  if (!bill) throw new Error("Bill not found");
  if (bill.status !== "PENDING_APPROVAL") {
    throw new Error(`Bill is ${bill.status}, not PENDING_APPROVAL`);
  }

  const pending = await db.billApproval.findFirst({
    where: { billId: bill.id, decision: null },
    orderBy: { submittedAt: "desc" },
  });

  await db.$transaction(async (tx) => {
    await tx.bill.update({
      where: { id: bill.id },
      data: { status: "REJECTED" },
    });
    if (pending) {
      await tx.billApproval.update({
        where: { id: pending.id },
        data: {
          decision: "REJECTED",
          decidedById: args.decidedByUserId,
          decidedAt: new Date(),
          note: args.note,
        },
      });
    }
  });
}
