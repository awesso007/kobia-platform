"use server";

/*
 * SavedView server actions (Sprint 9). A SavedView captures a list view's
 * filters, sort, columns, and grouping so it can be recalled from the view
 * picker. Scope is PERSONAL (owned by the current user) or TENANT (shared).
 *
 * Every mutation runs requirePermission, writes an audit entry, and dispatches
 * an automation event, matching the rest of the CRM CRUD surface. Because the
 * AuditEntry entityType enum only covers LEAD/DEAL/CONTACT/COMPANY, SavedView
 * config changes are audited under the "COMPANY" stand-in (the same convention
 * Files use), with the real entityType + name carried in the diff.
 *
 * All DB access goes through getTenantDb().
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { revalidatePath } from "next/cache";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { auditWrite } from "@/lib/crm/audit";
import { requirePermission, getCurrentMembership } from "@/lib/rbac/require-permission";
import { dispatchAutomation } from "@/lib/automations/dispatch";

export type SavedViewEntity = "LEAD" | "DEAL" | "CONTACT" | "COMPANY" | "ACTIVITY" | "FILE";
export type SavedViewScopeInput = "PERSONAL" | "TENANT";
export type SavedViewSortDirInput = "ASC" | "DESC";

export type SavedViewRow = {
  id: string;
  entityType: SavedViewEntity;
  name: string;
  ownerClerkUserId: string | null;
  scope: SavedViewScopeInput;
  filters: Record<string, unknown>;
  sortBy: string | null;
  sortDir: SavedViewSortDirInput;
  columns: string[];
  groupBy: string | null;
  isDefault: boolean;
};

export type SavedViewInput = {
  entityType: SavedViewEntity;
  name: string;
  scope?: SavedViewScopeInput;
  filters?: Record<string, unknown>;
  sortBy?: string | null;
  sortDir?: SavedViewSortDirInput;
  columns?: string[];
  groupBy?: string | null;
  isDefault?: boolean;
};

function pathFor(entityType: SavedViewEntity): string {
  switch (entityType) {
    case "LEAD": return "/app/leads";
    case "DEAL": return "/app/deals";
    case "CONTACT": return "/app/contacts";
    case "COMPANY": return "/app/companies";
    case "ACTIVITY": return "/app/activities";
    case "FILE": return "/app/files";
  }
}

function toRow(v: {
  id: string;
  entityType: string;
  name: string;
  ownerClerkUserId: string | null;
  scope: string;
  filters: unknown;
  sortBy: string | null;
  sortDir: string;
  columns: unknown;
  groupBy: string | null;
  isDefault: boolean;
}): SavedViewRow {
  return {
    id: v.id,
    entityType: v.entityType as SavedViewEntity,
    name: v.name,
    ownerClerkUserId: v.ownerClerkUserId,
    scope: v.scope as SavedViewScopeInput,
    filters: (v.filters ?? {}) as Record<string, unknown>,
    sortBy: v.sortBy,
    sortDir: v.sortDir as SavedViewSortDirInput,
    columns: Array.isArray(v.columns) ? (v.columns as string[]) : [],
    groupBy: v.groupBy,
    isDefault: v.isDefault,
  };
}

/**
 * List saved views visible to the current user for an entity: all TENANT-scoped
 * views plus the user's own PERSONAL views. In unauthenticated dev contexts
 * (no membership) only TENANT views are returned.
 */
export async function listSavedViews(entityType: SavedViewEntity): Promise<SavedViewRow[]> {
  await requirePermission("record:read");
  const { db } = getTenantDb();
  const member = await getCurrentMembership();
  const rows = await db.savedView.findMany({
    where: {
      entityType: entityType as never,
      OR: [
        { scope: "TENANT" as never },
        ...(member?.clerkUserId ? [{ scope: "PERSONAL" as never, ownerClerkUserId: member.clerkUserId }] : []),
      ],
    },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
  return rows.map(toRow);
}

export async function createSavedView(input: SavedViewInput): Promise<string> {
  await requirePermission("record:create");
  const name = input.name?.trim();
  if (!name) throw new Error("View name is required.");
  const { db } = getTenantDb();
  const member = await getCurrentMembership();
  const scope: SavedViewScopeInput = input.scope ?? "PERSONAL";

  const view = await db.savedView.create({
    data: {
      entityType: input.entityType as never,
      name,
      scope: scope as never,
      ownerClerkUserId: scope === "PERSONAL" ? member?.clerkUserId ?? null : null,
      filters: (input.filters ?? {}) as never,
      sortBy: input.sortBy?.trim() || null,
      sortDir: (input.sortDir ?? "DESC") as never,
      columns: (input.columns ?? []) as never,
      groupBy: input.groupBy?.trim() || null,
      isDefault: input.isDefault ?? false,
    },
  });

  await auditWrite({
    action: "CREATE",
    entityType: "COMPANY",
    entityId: view.id,
    diff: { savedView: true, entityType: input.entityType, name, scope },
  });
  await dispatchAutomation({ type: "RECORD_CREATED", entityType: "COMPANY", entityId: view.id });
  revalidatePath(pathFor(input.entityType));
  return view.id;
}

export async function updateSavedView(id: string, input: SavedViewInput): Promise<void> {
  await requirePermission("record:update");
  const name = input.name?.trim();
  if (!name) throw new Error("View name is required.");
  const { db } = getTenantDb();
  const scope: SavedViewScopeInput = input.scope ?? "PERSONAL";
  const member = await getCurrentMembership();

  await db.savedView.update({
    where: { id },
    data: {
      name,
      scope: scope as never,
      ownerClerkUserId: scope === "PERSONAL" ? member?.clerkUserId ?? null : null,
      filters: (input.filters ?? {}) as never,
      sortBy: input.sortBy?.trim() || null,
      sortDir: (input.sortDir ?? "DESC") as never,
      columns: (input.columns ?? []) as never,
      groupBy: input.groupBy?.trim() || null,
      isDefault: input.isDefault ?? false,
    },
  });

  await auditWrite({
    action: "UPDATE",
    entityType: "COMPANY",
    entityId: id,
    diff: { savedView: true, entityType: input.entityType, name, scope },
  });
  await dispatchAutomation({ type: "RECORD_UPDATED", entityType: "COMPANY", entityId: id });
  revalidatePath(pathFor(input.entityType));
}

export async function deleteSavedView(id: string, entityType: SavedViewEntity): Promise<void> {
  await requirePermission("record:delete");
  const { db } = getTenantDb();
  await db.savedView.delete({ where: { id } });
  await auditWrite({
    action: "DELETE",
    entityType: "COMPANY",
    entityId: id,
    diff: { savedView: true, entityType },
  });
  revalidatePath(pathFor(entityType));
}
