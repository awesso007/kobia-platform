/*
 * File core logic (Sprint 8). Provider-agnostic helpers shared by the upload
 * server actions, the upload/complete API routes, and the inbound-email and
 * automation paths. These functions take an explicit db so they work both in a
 * request scope (getTenantDb) and in webhooks (getTenantPrisma by slug).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { createHash, randomBytes, scryptSync } from "node:crypto";
import type { PrismaClient } from "@/lib/db/generated/tenant";
import { headStored, deleteStored, downloadUrl, type StorageProvider } from "@/lib/storage";

export type FileEntity =
  | "LEAD"
  | "DEAL"
  | "CONTACT"
  | "COMPANY"
  | "ACTIVITY"
  | "EMAIL_MESSAGE"
  | "SMS_MESSAGE"
  | "NOTE";

export type FileRow = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  status: string;
  storageProvider: StorageProvider;
  storageKey: string;
  source: string;
  folderId: string | null;
  width: number | null;
  height: number | null;
  uploadedByClerkUserId: string | null;
  createdAt: string;
};

const SHA256_MAX_BYTES = 50 * 1024 * 1024;

/** A FileAttachment entity type that maps to a CRM record for automation dispatch. */
const DISPATCH_ENTITY: Partial<Record<FileEntity, "LEAD" | "DEAL" | "CONTACT" | "COMPANY">> = {
  LEAD: "LEAD",
  DEAL: "DEAL",
  CONTACT: "CONTACT",
  COMPANY: "COMPANY",
};

export function dispatchEntityFor(entityType: FileEntity): "LEAD" | "DEAL" | "CONTACT" | "COMPANY" | null {
  return DISPATCH_ENTITY[entityType] ?? null;
}

export function hashSharePassword(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(plain, salt, 32).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifySharePassword(plain: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hash] = parts;
  const candidate = scryptSync(plain, salt!, 32).toString("hex");
  return candidate === hash;
}

export function randomSlug(len = 12): string {
  return randomBytes(len)
    .toString("base64url")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, len)
    .padEnd(len, "0");
}

export function toFileRow(f: {
  id: string;
  name: string;
  mimeType: string;
  size: bigint;
  status: string;
  storageProvider: string;
  storageKey: string;
  source: string;
  folderId: string | null;
  width: number | null;
  height: number | null;
  uploadedByClerkUserId: string | null;
  createdAt: Date;
}): FileRow {
  return {
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    size: Number(f.size),
    status: f.status,
    storageProvider: f.storageProvider as StorageProvider,
    storageKey: f.storageKey,
    source: f.source,
    folderId: f.folderId,
    width: f.width,
    height: f.height,
    uploadedByClerkUserId: f.uploadedByClerkUserId,
    createdAt: f.createdAt.toISOString(),
  };
}

/**
 * Mark an UPLOADING File READY after the client has put the bytes. HEADs the
 * object to confirm presence + true size, computes a sha256 for small files,
 * and optionally creates a FileAttachment. Returns the dispatch info so the
 * caller (which has the request scope) can fire FILE_UPLOADED + auditWrite.
 */
export async function completeUpload(
  db: PrismaClient,
  fileId: string,
  opts?: {
    entityType?: FileEntity | null;
    entityId?: string | null;
    attachedByClerkUserId?: string | null;
    localBytes?: Buffer | null;
  },
): Promise<{ ok: boolean; error?: string; file?: FileRow; attachmentId?: string }> {
  const file = await db.file.findUnique({ where: { id: fileId } });
  if (!file) return { ok: false, error: "File not found." };

  const head = await headStored(file.storageProvider as StorageProvider, file.storageKey);
  if (!head) {
    await db.file.update({ where: { id: fileId }, data: { status: "FAILED" } });
    return { ok: false, error: "Uploaded object not found in storage." };
  }

  let sha256: string | null = null;
  if (head.size <= SHA256_MAX_BYTES && opts?.localBytes) {
    sha256 = createHash("sha256").update(opts.localBytes).digest("hex");
  }

  const updated = await db.file.update({
    where: { id: fileId },
    data: {
      status: "READY",
      size: BigInt(head.size),
      ...(sha256 ? { sha256 } : {}),
    },
  });

  let attachmentId: string | undefined;
  if (opts?.entityType && opts?.entityId) {
    const att = await attachFile(db, {
      fileId,
      entityType: opts.entityType,
      entityId: opts.entityId,
      attachedByClerkUserId: opts.attachedByClerkUserId ?? null,
    });
    attachmentId = att.id;
  }

  return { ok: true, file: toFileRow(updated), attachmentId };
}

export async function attachFile(
  db: PrismaClient,
  input: {
    fileId: string;
    entityType: FileEntity;
    entityId: string;
    attachedByClerkUserId?: string | null;
  },
): Promise<{ id: string }> {
  const existing = await db.fileAttachment.findUnique({
    where: {
      fileId_entityType_entityId: {
        fileId: input.fileId,
        entityType: input.entityType as never,
        entityId: input.entityId,
      },
    },
  });
  if (existing) return { id: existing.id };
  const created = await db.fileAttachment.create({
    data: {
      fileId: input.fileId,
      entityType: input.entityType as never,
      entityId: input.entityId,
      attachedByClerkUserId: input.attachedByClerkUserId ?? null,
    },
  });
  return { id: created.id };
}

export async function listFilesForEntity(
  db: PrismaClient,
  entityType: FileEntity,
  entityId: string,
): Promise<FileRow[]> {
  const atts = await db.fileAttachment.findMany({
    where: { entityType: entityType as never, entityId },
    include: { file: true },
    orderBy: { createdAt: "desc" },
  });
  return atts
    .filter((a) => a.file && a.file.status !== "DELETED")
    .map((a) => toFileRow(a.file));
}

export async function softDeleteFile(db: PrismaClient, fileId: string): Promise<void> {
  const file = await db.file.findUnique({ where: { id: fileId } });
  if (!file) return;
  await db.file.update({ where: { id: fileId }, data: { status: "DELETED" } });
  try {
    await deleteStored(file.storageProvider as StorageProvider, file.storageKey);
  } catch (err) {
    console.error("[files] storage delete failed", err);
  }
}

export async function fileDownloadUrl(
  file: { storageProvider: string; storageKey: string; name: string },
  opts?: { inline?: boolean; expiresIn?: number },
): Promise<string> {
  const disposition = `${opts?.inline ? "inline" : "attachment"}; filename="${file.name.replace(/"/g, "")}"`;
  return downloadUrl(file.storageProvider as StorageProvider, file.storageKey, {
    contentDisposition: disposition,
    expiresIn: opts?.expiresIn,
  });
}
