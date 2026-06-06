"use server";

/*
 * Shared CRM activity server actions used by the RecordPane (Activity + Notes
 * tabs and the add-activity composer). All DB access goes through getTenantDb()
 * so the tenant is resolved from request headers, never by importing the tenant
 * Prisma client directly.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantDb } from "@/lib/db/get-tenant-db";
import {
  ACTIVITY_FK_BY_TYPE,
  type ActivityKind,
  type ActivityRow,
  type RecordType,
} from "@/lib/crm/record";

const VALID_TYPES: ActivityKind[] = ["NOTE", "CALL", "EMAIL", "MEETING", "TASK"];

export async function listActivities(
  type: RecordType,
  id: string,
  opts?: { notesOnly?: boolean },
): Promise<ActivityRow[]> {
  const { db } = getTenantDb();
  const fk = ACTIVITY_FK_BY_TYPE[type];
  const rows = await db.crmActivity.findMany({
    where: {
      [fk]: id,
      ...(opts?.notesOnly ? { type: "NOTE" } : {}),
    },
    orderBy: { occurredAt: "desc" },
    take: 200,
  });
  return rows.map((r) => ({
    id: r.id,
    type: r.type as ActivityKind,
    subject: r.subject,
    body: r.body,
    occurredAt: r.occurredAt.toISOString(),
    createdByUserId: r.createdByUserId,
  }));
}

export async function addActivity(input: {
  type: RecordType;
  id: string;
  kind: ActivityKind;
  subject: string;
  body?: string;
}): Promise<ActivityRow> {
  const kind: ActivityKind = VALID_TYPES.includes(input.kind) ? input.kind : "NOTE";
  const subject = input.subject.trim();
  if (!subject) {
    throw new Error("Activity subject is required.");
  }
  const { db } = getTenantDb();
  const fk = ACTIVITY_FK_BY_TYPE[input.type];
  const created = await db.crmActivity.create({
    data: {
      type: kind,
      subject,
      body: input.body?.trim() || null,
      [fk]: input.id,
    },
  });
  return {
    id: created.id,
    type: created.type as ActivityKind,
    subject: created.subject,
    body: created.body,
    occurredAt: created.occurredAt.toISOString(),
    createdByUserId: created.createdByUserId,
  };
}
