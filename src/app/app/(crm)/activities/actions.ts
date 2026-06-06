"use server";

/*
 * Activities server actions. All DB access goes through getTenantDb() so the
 * tenant resolves from request headers (never by importing the tenant Prisma
 * client directly). Each mutation records an audit entry and dispatches the
 * automation engine after the DB write, mirroring the other CRM modules.
 *
 * AuditEntry.entityType is the four-value CrmEntityType (no ACTIVITY), so an
 * activity is audited against its related record (lead/deal/contact/company)
 * when one is set; an orphan activity skips the audit write. The automation
 * dispatch always fires with the ACTIVITY entity type.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { revalidatePath } from "next/cache";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { auditWrite } from "@/lib/crm/audit";
import { dispatchAutomation } from "@/lib/automations/dispatch";
import {
  ACTIVITY_FK_BY_TYPE,
  ACTIVITY_TYPES,
  ENTITY_TYPE_BY_RECORD,
  type ActivityKind,
  type RecordType,
} from "@/lib/crm/record";

const RELATED_TYPES: RecordType[] = ["lead", "deal", "contact", "company"];

function asKind(v: unknown): ActivityKind {
  return ACTIVITY_TYPES.includes(v as ActivityKind) ? (v as ActivityKind) : "TASK";
}

export type ActivityInput = {
  type: string;
  subject: string;
  body?: string;
  dueAt?: string | null;
  ownerClerkUserId?: string | null;
  relatedType?: string | null;
  relatedId?: string | null;
};

function relatedRef(input: { relatedType?: string | null; relatedId?: string | null }): {
  type: RecordType;
  id: string;
} | null {
  if (input.relatedType && input.relatedId && RELATED_TYPES.includes(input.relatedType as RecordType)) {
    return { type: input.relatedType as RecordType, id: input.relatedId };
  }
  return null;
}

/** Audit an activity mutation against its related CRM record, if any. */
async function auditAgainstRelated(
  action: "CREATE" | "UPDATE" | "DELETE",
  ref: { type: RecordType; id: string } | null,
  diff?: unknown,
) {
  if (!ref) return;
  await auditWrite({ action, entityType: ENTITY_TYPE_BY_RECORD[ref.type], entityId: ref.id, diff });
}

export async function createActivity(input: ActivityInput) {
  const subject = input.subject?.trim();
  if (!subject) throw new Error("Activity subject is required.");
  const { db } = getTenantDb();
  const ref = relatedRef(input);
  const activity = await db.crmActivity.create({
    data: {
      type: asKind(input.type),
      subject,
      body: input.body?.trim() || null,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      ownerClerkUserId: input.ownerClerkUserId?.trim() || null,
      ...(ref ? { [ACTIVITY_FK_BY_TYPE[ref.type]]: ref.id } : {}),
    },
  });

  await auditAgainstRelated("CREATE", ref, { activityId: activity.id, subject });
  await dispatchAutomation({ type: "RECORD_CREATED", entityType: "ACTIVITY", entityId: activity.id });
  revalidatePath("/app/activities");
  return activity.id;
}

export async function updateActivity(id: string, input: ActivityInput) {
  const subject = input.subject?.trim();
  if (!subject) throw new Error("Activity subject is required.");
  const { db } = getTenantDb();
  const ref = relatedRef(input);
  await db.crmActivity.update({
    where: { id },
    data: {
      type: asKind(input.type),
      subject,
      body: input.body?.trim() || null,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      ownerClerkUserId: input.ownerClerkUserId?.trim() || null,
      ...(ref ? { [ACTIVITY_FK_BY_TYPE[ref.type]]: ref.id } : {}),
    },
  });

  await auditAgainstRelated("UPDATE", ref, { activityId: id, subject });
  await dispatchAutomation({ type: "RECORD_UPDATED", entityType: "ACTIVITY", entityId: id });
  revalidatePath("/app/activities");
}

/** Toggle the completed state from a list-row checkbox. */
export async function setActivityComplete(id: string, complete: boolean) {
  const { db } = getTenantDb();
  const activity = await db.crmActivity.update({
    where: { id },
    data: { completedAt: complete ? new Date() : null },
  });
  await auditAgainstRelated(
    "UPDATE",
    relatedRefFromRow(activity),
    { activityId: id, completed: complete },
  );
  await dispatchAutomation({
    type: "FIELD_CHANGED",
    entityType: "ACTIVITY",
    entityId: id,
    changedFields: ["completedAt"],
  });
  revalidatePath("/app/activities");
}

export async function deleteActivity(id: string) {
  const { db } = getTenantDb();
  const activity = await db.crmActivity.findUnique({ where: { id } });
  await db.crmActivity.delete({ where: { id } });
  await auditAgainstRelated("DELETE", relatedRefFromRow(activity), { activityId: id });
  revalidatePath("/app/activities");
}

function relatedRefFromRow(
  row: { leadId: string | null; dealId: string | null; contactId: string | null; companyId: string | null } | null,
): { type: RecordType; id: string } | null {
  if (!row) return null;
  if (row.leadId) return { type: "lead", id: row.leadId };
  if (row.dealId) return { type: "deal", id: row.dealId };
  if (row.contactId) return { type: "contact", id: row.contactId };
  if (row.companyId) return { type: "company", id: row.companyId };
  return null;
}
