/*
 * Segment evaluation (Sprint 13, server-only). A Segment stores a filterJson of
 * the shape { combinator: "AND"|"OR", rows: [{ field, operator, value }] } over
 * either contacts or leads. evaluateSegment loads every candidate row, builds a
 * flat snapshot (including a synthetic `tag` field resolved from TagAssignment),
 * and reuses the pure condition evaluator from the automations engine so segment
 * filters behave exactly like automation conditions.
 *
 * Recipients are reduced to a contactable shape (id, email, phone, name) for
 * broadcasts and campaign enrollment. An empty/missing filter matches all rows.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import type { PrismaClient } from "@/lib/db/generated/tenant";
import { evaluateConditions, type ConditionGroup } from "@/lib/automations/types";

export type SegmentEntity = "contact" | "lead";

export type SegmentRecipient = {
  entityType: SegmentEntity;
  id: string;
  email: string | null;
  phone: string | null;
  name: string;
};

/** Coerce arbitrary stored JSON into a ConditionGroup (tolerant of legacy shapes). */
export function normalizeFilter(filterJson: unknown): ConditionGroup {
  const f = (filterJson ?? {}) as Record<string, unknown>;
  const combinator = f.combinator === "OR" ? "OR" : "AND";
  const rawRows = Array.isArray(f.rows) ? f.rows : [];
  const rows = rawRows
    .map((r) => {
      const row = (r ?? {}) as Record<string, unknown>;
      const field = String(row.field ?? "").trim();
      const operator = String(row.operator ?? "eq");
      const value = row.value == null ? undefined : String(row.value);
      return { field, operator: operator as ConditionGroup["rows"][number]["operator"], value };
    })
    .filter((r) => r.field !== "");
  return { combinator, rows };
}

/** Fields each entity exposes to the segment builder (plus the synthetic `tag`). */
export const SEGMENT_FIELDS: Record<SegmentEntity, { field: string; label: string }[]> = {
  contact: [
    { field: "firstName", label: "First name" },
    { field: "lastName", label: "Last name" },
    { field: "email", label: "Email" },
    { field: "phone", label: "Phone" },
    { field: "title", label: "Job title" },
    { field: "tag", label: "Tag" },
  ],
  lead: [
    { field: "name", label: "Name" },
    { field: "companyName", label: "Company" },
    { field: "email", label: "Email" },
    { field: "phone", label: "Phone" },
    { field: "status", label: "Status" },
    { field: "source", label: "Source" },
    { field: "tag", label: "Tag" },
  ],
};

function contactName(c: { firstName: string; lastName: string | null }): string {
  return [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || c.firstName;
}

/**
 * Load all matching recipients for a segment. Evaluates the filter in memory so
 * the synthetic `tag` field and the automations operator set both apply. For the
 * data volumes in this alpha (hundreds of rows per tenant) this is fine; a SQL
 * push-down can come later.
 */
export async function evaluateSegment(
  db: PrismaClient,
  segment: { entityType: SegmentEntity; filterJson: unknown },
): Promise<SegmentRecipient[]> {
  const group = normalizeFilter(segment.filterJson);
  const needsTags = group.rows.some((r) => r.field === "tag");

  if (segment.entityType === "lead") {
    const leads = await db.lead.findMany();
    const tagMap = needsTags ? await loadTagNames(db, "LEAD", leads.map((l) => l.id)) : new Map();
    const out: SegmentRecipient[] = [];
    for (const l of leads) {
      const snapshot: Record<string, unknown> = { ...l, tag: (tagMap.get(l.id) ?? []).join(",") };
      if (!evaluateConditions(group, snapshot)) continue;
      out.push({ entityType: "lead", id: l.id, email: l.email ?? null, phone: l.phone ?? null, name: l.name });
    }
    return out;
  }

  const contacts = await db.contact.findMany();
  const tagMap = needsTags ? await loadTagNames(db, "CONTACT", contacts.map((c) => c.id)) : new Map();
  const out: SegmentRecipient[] = [];
  for (const c of contacts) {
    const snapshot: Record<string, unknown> = { ...c, tag: (tagMap.get(c.id) ?? []).join(",") };
    if (!evaluateConditions(group, snapshot)) continue;
    out.push({ entityType: "contact", id: c.id, email: c.email ?? null, phone: c.phone ?? null, name: contactName(c) });
  }
  return out;
}

/** Map entityId -> [tagName] for a set of records of one CRM entity type. */
async function loadTagNames(
  db: PrismaClient,
  entityType: "LEAD" | "CONTACT",
  ids: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (ids.length === 0) return map;
  const assignments = await db.tagAssignment.findMany({
    where: { entityType, entityId: { in: ids } },
    include: { tag: { select: { name: true } } },
  });
  for (const a of assignments) {
    const list = map.get(a.entityId) ?? [];
    list.push(a.tag.name);
    map.set(a.entityId, list);
  }
  return map;
}

/** Recompute and persist a segment's cached recipient count. Returns the list. */
export async function recalcSegment(
  db: PrismaClient,
  segmentId: string,
): Promise<SegmentRecipient[]> {
  const segment = await db.segment.findUnique({ where: { id: segmentId } });
  if (!segment) return [];
  const recipients = await evaluateSegment(db, {
    entityType: segment.entityType as SegmentEntity,
    filterJson: segment.filterJson,
  });
  await db.segment.update({
    where: { id: segmentId },
    data: { recipientCountCache: recipients.length, lastEvaluatedAt: new Date() },
  });
  return recipients;
}
