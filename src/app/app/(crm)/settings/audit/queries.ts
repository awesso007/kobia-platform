/*
 * Audit log query helper (server-only). Reads tenant-scoped AuditEntry rows for
 * the /app/settings/audit surface. Supports filtering by entity type, action,
 * actor, and a created-at date range, with pagination.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { ENTITY_TYPES, type EntityType } from "@/lib/crm/record";
import { AUDIT_ACTIONS, AUDIT_PAGE_SIZE, type AuditActionKind, type AuditRow } from "./types";

export { AUDIT_ACTIONS, AUDIT_PAGE_SIZE };
export type { AuditActionKind, AuditRow };

export type AuditListParams = {
  entityType?: string;
  action?: string;
  actor?: string;
  from?: string;
  to?: string;
  page?: number;
};

export async function listAuditEntries(params: AuditListParams): Promise<{
  rows: AuditRow[];
  total: number;
  page: number;
  pageCount: number;
  actors: string[];
}> {
  const { db } = getTenantDb();
  const page = Math.max(1, params.page ?? 1);

  const where: Record<string, unknown> = {};
  if (params.entityType && ENTITY_TYPES.includes(params.entityType as EntityType)) {
    where.entityType = params.entityType;
  }
  if (params.action && AUDIT_ACTIONS.includes(params.action as AuditActionKind)) {
    where.action = params.action;
  }
  if (params.actor) where.actorEmail = params.actor;

  const createdAt: Record<string, Date> = {};
  if (params.from) {
    const d = new Date(params.from);
    if (!Number.isNaN(d.getTime())) createdAt.gte = d;
  }
  if (params.to) {
    const d = new Date(params.to);
    if (!Number.isNaN(d.getTime())) {
      d.setHours(23, 59, 59, 999);
      createdAt.lte = d;
    }
  }
  if (Object.keys(createdAt).length) where.createdAt = createdAt;

  const [total, entries, actorRows] = await Promise.all([
    db.auditEntry.count({ where }),
    db.auditEntry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * AUDIT_PAGE_SIZE,
      take: AUDIT_PAGE_SIZE,
    }),
    db.auditEntry.findMany({
      where: { actorEmail: { not: null } },
      distinct: ["actorEmail"],
      select: { actorEmail: true },
    }),
  ]);

  return {
    rows: entries.map((e) => ({
      id: e.id,
      action: e.action as AuditActionKind,
      entityType: e.entityType,
      entityId: e.entityId,
      actorClerkUserId: e.actorClerkUserId,
      actorEmail: e.actorEmail,
      diff: e.diff,
      ip: e.ip,
      userAgent: e.userAgent,
      createdAt: e.createdAt.toISOString(),
    })),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)),
    actors: actorRows.map((a) => a.actorEmail).filter((a): a is string => Boolean(a)),
  };
}
