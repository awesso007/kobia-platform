"use server";

/*
 * File + Document Library server actions (Sprint 8). Covers folder CRUD, file
 * listing/rename/move/delete/detach, share-link create/revoke, and download URL
 * minting. The upload itself is two HTTP calls handled by the /api/files routes
 * (presigned PUT then complete); these actions cover everything else.
 *
 * RBAC: file management reuses the record permissions ("record:create" to
 * upload/attach, "record:update" to rename/move, "record:delete" to delete).
 * Every mutation calls auditWrite. File entities have no dedicated audit
 * EntityType, so we log them under "COMPANY" (the same stand-in the telephony
 * sprint uses).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { auditWrite } from "@/lib/crm/audit";
import { requirePermission, getCurrentMembership } from "@/lib/rbac/require-permission";
import { s3Configured } from "@/lib/storage";
import {
  toFileRow,
  fileDownloadUrl,
  softDeleteFile,
  randomSlug,
  hashSharePassword,
  type FileRow,
  type FileEntity,
} from "@/lib/files/files";

export type { FileRow, FileEntity };

export type FolderRow = {
  id: string;
  name: string;
  parentId: string | null;
  fileCount: number;
};

export type ShareLinkRow = {
  id: string;
  fileId: string;
  fileName: string;
  slug: string;
  hasPassword: boolean;
  expiresAt: string | null;
  maxDownloads: number | null;
  downloadCount: number;
  createdAt: string;
};

/* --------------------------------- folders --------------------------------- */

export async function listFolders(): Promise<FolderRow[]> {
  const { db } = getTenantDb();
  const folders = await db.fileFolder.findMany({ orderBy: { name: "asc" } });
  const counts = await db.file.groupBy({
    by: ["folderId"],
    where: { status: { not: "DELETED" } },
    _count: { _all: true },
  });
  const countByFolder = new Map(counts.map((c) => [c.folderId, c._count._all]));
  return folders.map((f) => ({
    id: f.id,
    name: f.name,
    parentId: f.parentId,
    fileCount: countByFolder.get(f.id) ?? 0,
  }));
}

export async function createFolder(name: string, parentId?: string | null): Promise<FolderRow> {
  await requirePermission("record:create");
  const { db } = getTenantDb();
  const member = await getCurrentMembership();
  const folder = await db.fileFolder.create({
    data: {
      name: name.trim() || "Untitled folder",
      parentId: parentId ?? null,
      ownerClerkUserId: member?.clerkUserId ?? null,
    },
  });
  await auditWrite({ action: "CREATE", entityType: "COMPANY", entityId: folder.id, diff: { folder: folder.name } });
  return { id: folder.id, name: folder.name, parentId: folder.parentId, fileCount: 0 };
}

export async function renameFolder(id: string, name: string): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  await db.fileFolder.update({ where: { id }, data: { name: name.trim() || "Untitled folder" } });
  await auditWrite({ action: "UPDATE", entityType: "COMPANY", entityId: id, diff: { name } });
}

export async function deleteFolder(id: string): Promise<void> {
  await requirePermission("record:delete");
  const { db } = getTenantDb();
  await db.fileFolder.delete({ where: { id } });
  await auditWrite({ action: "DELETE", entityType: "COMPANY", entityId: id });
}

/* ---------------------------------- files ---------------------------------- */

export type FileFilter = {
  folderId?: string | null;
  mimePrefix?: string | null;
  uploaderClerkUserId?: string | null;
  source?: string | null;
  search?: string | null;
  view?: "all" | "recent" | "email" | "sms" | null;
};

export async function listFiles(filter: FileFilter = {}): Promise<FileRow[]> {
  const { db } = getTenantDb();
  const where: Record<string, unknown> = { status: { not: "DELETED" } };
  if (filter.view === "email") where.source = "EMAIL";
  else if (filter.view === "sms") where.source = "SMS";
  else if (filter.source) where.source = filter.source;
  if (filter.folderId !== undefined && filter.view !== "recent") where.folderId = filter.folderId;
  if (filter.uploaderClerkUserId) where.uploadedByClerkUserId = filter.uploaderClerkUserId;
  if (filter.mimePrefix) where.mimeType = { startsWith: filter.mimePrefix };
  if (filter.search?.trim()) where.name = { contains: filter.search.trim(), mode: "insensitive" };

  const take = filter.view === "recent" ? 50 : 500;
  const files = await db.file.findMany({ where, orderBy: { createdAt: "desc" }, take });
  return files.map(toFileRow);
}

export async function renameFile(id: string, name: string): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  await db.file.update({ where: { id }, data: { name: name.trim() || "file" } });
  await auditWrite({ action: "UPDATE", entityType: "COMPANY", entityId: id, diff: { name } });
}

export async function moveFile(id: string, folderId: string | null): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  await db.file.update({ where: { id }, data: { folderId } });
  await auditWrite({ action: "UPDATE", entityType: "COMPANY", entityId: id, diff: { folderId } });
}

export async function deleteFile(id: string): Promise<void> {
  await requirePermission("record:delete");
  const { db } = getTenantDb();
  await softDeleteFile(db, id);
  await auditWrite({ action: "DELETE", entityType: "COMPANY", entityId: id });
}

export async function detachFile(input: { fileId: string; entityType: FileEntity; entityId: string }): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  await db.fileAttachment.deleteMany({
    where: { fileId: input.fileId, entityType: input.entityType as never, entityId: input.entityId },
  });
  await auditWrite({ action: "UPDATE", entityType: "COMPANY", entityId: input.fileId, diff: { detachedFrom: input.entityType } });
}

export async function getDownloadUrl(id: string, inline = false): Promise<{ ok: boolean; url?: string; error?: string }> {
  await requirePermission("record:read");
  const { db } = getTenantDb();
  const file = await db.file.findUnique({ where: { id } });
  if (!file || file.status === "DELETED") return { ok: false, error: "File not found." };
  const url = await fileDownloadUrl(file, { inline });
  return { ok: true, url };
}

/* ------------------------------ attachments view ---------------------------- */

export async function listFilesForRecord(entityType: FileEntity, entityId: string): Promise<FileRow[]> {
  const { db } = getTenantDb();
  const atts = await db.fileAttachment.findMany({
    where: { entityType: entityType as never, entityId },
    include: { file: true },
    orderBy: { createdAt: "desc" },
  });
  return atts.filter((a) => a.file && a.file.status !== "DELETED").map((a) => toFileRow(a.file));
}

/* ------------------------------- share links -------------------------------- */

export async function createShareLink(input: {
  fileId: string;
  password?: string | null;
  expiresAt?: string | null;
  maxDownloads?: number | null;
}): Promise<{ ok: boolean; slug?: string; error?: string }> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  const file = await db.file.findUnique({ where: { id: input.fileId } });
  if (!file || file.status === "DELETED") return { ok: false, error: "File not found." };
  const member = await getCurrentMembership();
  const slug = randomSlug(12);
  await db.fileShareLink.create({
    data: {
      fileId: input.fileId,
      slug,
      password: input.password ? hashSharePassword(input.password) : null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      maxDownloads: input.maxDownloads ?? null,
      createdByClerkUserId: member?.clerkUserId ?? null,
    },
  });
  await auditWrite({ action: "CREATE", entityType: "COMPANY", entityId: input.fileId, diff: { shareLink: slug } });
  return { ok: true, slug };
}

export async function listShareLinks(): Promise<ShareLinkRow[]> {
  const { db } = getTenantDb();
  const links = await db.fileShareLink.findMany({ include: { file: true }, orderBy: { createdAt: "desc" } });
  return links.map((l) => ({
    id: l.id,
    fileId: l.fileId,
    fileName: l.file?.name ?? "(deleted)",
    slug: l.slug,
    hasPassword: Boolean(l.password),
    expiresAt: l.expiresAt ? l.expiresAt.toISOString() : null,
    maxDownloads: l.maxDownloads,
    downloadCount: l.downloadCount,
    createdAt: l.createdAt.toISOString(),
  }));
}

export async function revokeShareLink(id: string): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  const link = await db.fileShareLink.findUnique({ where: { id } });
  await db.fileShareLink.delete({ where: { id } });
  if (link) await auditWrite({ action: "DELETE", entityType: "COMPANY", entityId: link.fileId, diff: { revokedShare: link.slug } });
}

/* ------------------------------ storage status ------------------------------ */

export async function storageStatus(): Promise<{ s3Configured: boolean; totalBytes: number; fileCount: number }> {
  const { db } = getTenantDb();
  const agg = await db.file.aggregate({
    where: { status: { not: "DELETED" } },
    _sum: { size: true },
    _count: { _all: true },
  });
  return {
    s3Configured: s3Configured(),
    totalBytes: Number(agg._sum.size ?? 0n),
    fileCount: agg._count._all,
  };
}

export async function listUploaders(): Promise<{ clerkUserId: string; displayName: string }[]> {
  const { db } = getTenantDb();
  const members = await db.membership.findMany({ orderBy: { displayName: "asc" } });
  return members.map((m) => ({ clerkUserId: m.clerkUserId, displayName: m.displayName ?? m.email ?? m.clerkUserId }));
}
