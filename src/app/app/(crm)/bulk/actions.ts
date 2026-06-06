"use server";

/*
 * Bulk actions for CRM list views. Operates on a set of selected record ids for
 * one entity type (LEAD | DEAL | CONTACT | COMPANY). Every mutation routes
 * through getTenantDb(), checks requirePermission, and writes one audit row per
 * entity. Work is processed in chunks of 500 inside a transaction per chunk so a
 * large selection never opens one giant transaction.
 *
 * CSV export is read-only: it pulls the selected rows and returns a CSV string
 * the client turns into a download. No em-dashes in copy (use hyphens).
 */
import { revalidatePath } from "next/cache";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { auditWrite } from "@/lib/crm/audit";
import { requirePermission } from "@/lib/rbac/require-permission";
import { dispatchAutomation } from "@/lib/automations/dispatch";
import { reindex, removeFromIndex } from "@/lib/search";
import { ENTITY_TYPES, type EntityType } from "@/lib/crm/record";

const CHUNK = 500;

function asEntityType(v: unknown): EntityType {
  return ENTITY_TYPES.includes(v as EntityType) ? (v as EntityType) : "LEAD";
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function cleanIds(ids: string[]): string[] {
  return Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
}

function pathFor(entityType: EntityType): string {
  switch (entityType) {
    case "LEAD":
      return "/app/leads";
    case "DEAL":
      return "/app/deals";
    case "CONTACT":
      return "/app/contacts";
    case "COMPANY":
      return "/app/companies";
  }
}

/* Map an entity type to its Prisma delegate's deleteMany so chunks can run in a
 * single transaction. Returning a thunk keeps the delegate typing local. */
function deleteManyFor(db: ReturnType<typeof getTenantDb>["db"], entityType: EntityType, ids: string[]) {
  const where = { id: { in: ids } };
  switch (entityType) {
    case "LEAD":
      return db.lead.deleteMany({ where });
    case "DEAL":
      return db.deal.deleteMany({ where });
    case "CONTACT":
      return db.contact.deleteMany({ where });
    case "COMPANY":
      return db.company.deleteMany({ where });
  }
}

function updateOwnerManyFor(
  db: ReturnType<typeof getTenantDb>["db"],
  entityType: EntityType,
  ids: string[],
  ownerUserId: string | null,
) {
  const where = { id: { in: ids } };
  const data = { ownerUserId };
  switch (entityType) {
    case "LEAD":
      return db.lead.updateMany({ where, data });
    case "DEAL":
      return db.deal.updateMany({ where, data });
    case "CONTACT":
      return db.contact.updateMany({ where, data });
    case "COMPANY":
      return db.company.updateMany({ where, data });
  }
}

export async function bulkDelete(input: { entityType: string; ids: string[] }): Promise<number> {
  await requirePermission("record:delete");
  const entityType = asEntityType(input.entityType);
  const ids = cleanIds(input.ids);
  if (ids.length === 0) return 0;
  const { db } = getTenantDb();

  let done = 0;
  for (const part of chunk(ids, CHUNK)) {
    await db.$transaction([deleteManyFor(db, entityType, part)]);
    for (const id of part) {
      await auditWrite({ action: "DELETE", entityType, entityId: id });
      await removeFromIndex(db, entityType, id);
    }
    done += part.length;
  }
  revalidatePath(pathFor(entityType));
  return done;
}

export async function bulkAddTag(input: { entityType: string; ids: string[]; tagId: string }): Promise<number> {
  await requirePermission("record:update");
  const entityType = asEntityType(input.entityType);
  const ids = cleanIds(input.ids);
  const tagId = input.tagId?.trim();
  if (ids.length === 0 || !tagId) return 0;
  const { db } = getTenantDb();

  let done = 0;
  for (const part of chunk(ids, CHUNK)) {
    await db.$transaction(
      part.map((entityId) =>
        db.tagAssignment.upsert({
          where: { tagId_entityType_entityId: { tagId, entityType, entityId } },
          create: { tagId, entityType, entityId },
          update: {},
        }),
      ),
    );
    for (const id of part) {
      await auditWrite({ action: "UPDATE", entityType, entityId: id, diff: { addTag: tagId } });
      await reindex(db, entityType, id);
      await dispatchAutomation({ type: "RECORD_UPDATED", entityType, entityId: id });
    }
    done += part.length;
  }
  revalidatePath(pathFor(entityType));
  return done;
}

export async function bulkRemoveTag(input: { entityType: string; ids: string[]; tagId: string }): Promise<number> {
  await requirePermission("record:update");
  const entityType = asEntityType(input.entityType);
  const ids = cleanIds(input.ids);
  const tagId = input.tagId?.trim();
  if (ids.length === 0 || !tagId) return 0;
  const { db } = getTenantDb();

  let done = 0;
  for (const part of chunk(ids, CHUNK)) {
    await db.$transaction([
      db.tagAssignment.deleteMany({ where: { tagId, entityType, entityId: { in: part } } }),
    ]);
    for (const id of part) {
      await auditWrite({ action: "UPDATE", entityType, entityId: id, diff: { removeTag: tagId } });
      await reindex(db, entityType, id);
    }
    done += part.length;
  }
  revalidatePath(pathFor(entityType));
  return done;
}

export async function bulkChangeOwner(input: {
  entityType: string;
  ids: string[];
  ownerUserId: string | null;
}): Promise<number> {
  await requirePermission("record:update");
  const entityType = asEntityType(input.entityType);
  const ids = cleanIds(input.ids);
  if (ids.length === 0) return 0;
  const ownerUserId = input.ownerUserId?.trim() || null;
  const { db } = getTenantDb();

  let done = 0;
  for (const part of chunk(ids, CHUNK)) {
    await db.$transaction([updateOwnerManyFor(db, entityType, part, ownerUserId)]);
    for (const id of part) {
      await auditWrite({ action: "UPDATE", entityType, entityId: id, diff: { ownerUserId } });
      await reindex(db, entityType, id);
      await dispatchAutomation({ type: "RECORD_UPDATED", entityType, entityId: id });
    }
    done += part.length;
  }
  revalidatePath(pathFor(entityType));
  return done;
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const r of rows) lines.push(r.map(csvCell).join(","));
  return lines.join("\n");
}

/** Read-only CSV export of the selected records. requirePermission record:read. */
export async function bulkExportCsv(input: { entityType: string; ids: string[] }): Promise<string> {
  await requirePermission("record:read");
  const entityType = asEntityType(input.entityType);
  const ids = cleanIds(input.ids);
  if (ids.length === 0) return "";
  const { db } = getTenantDb();
  const where = { id: { in: ids } };

  if (entityType === "LEAD") {
    const rows = await db.lead.findMany({
      where,
      select: { name: true, email: true, phone: true, companyName: true, source: true, status: true, ownerUserId: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    return toCsv(
      ["Name", "Email", "Phone", "Company", "Source", "Status", "Owner", "Created"],
      rows.map((r) => [r.name, r.email, r.phone, r.companyName, r.source, r.status, r.ownerUserId, r.createdAt.toISOString()]),
    );
  }
  if (entityType === "DEAL") {
    const rows = await db.deal.findMany({
      where,
      select: { name: true, amountCents: true, status: true, ownerUserId: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    return toCsv(
      ["Name", "Amount", "Status", "Owner", "Created"],
      rows.map((r) => [r.name, (Number(r.amountCents) / 100).toFixed(2), r.status, r.ownerUserId, r.createdAt.toISOString()]),
    );
  }
  if (entityType === "CONTACT") {
    const rows = await db.contact.findMany({
      where,
      select: { firstName: true, lastName: true, email: true, phone: true, title: true, ownerUserId: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    return toCsv(
      ["First name", "Last name", "Email", "Phone", "Title", "Owner", "Created"],
      rows.map((r) => [r.firstName, r.lastName, r.email, r.phone, r.title, r.ownerUserId, r.createdAt.toISOString()]),
    );
  }
  const rows = await db.company.findMany({
    where,
    select: { name: true, domain: true, industry: true, size: true, phone: true, ownerUserId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  return toCsv(
    ["Name", "Domain", "Industry", "Size", "Phone", "Owner", "Created"],
    rows.map((r) => [r.name, r.domain, r.industry, r.size, r.phone, r.ownerUserId, r.createdAt.toISOString()]),
  );
}
