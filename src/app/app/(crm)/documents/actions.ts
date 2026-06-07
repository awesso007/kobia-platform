"use server";

/*
 * Documents server actions (Sprint 14). All DB access goes through getTenantDb().
 * Each mutating action enforces requirePermission and reindexes search where
 * relevant. Documents are not CRM-audited entities (auditWrite only covers
 * LEAD/DEAL/CONTACT/COMPANY) so auditWrite is skipped by design, mirroring the
 * Marketing and Calendar modules. Envelopes carry their own audit trail
 * (EnvelopeAuditEvent) written inside the envelope lib.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { revalidatePath } from "next/cache";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { requirePermission } from "@/lib/rbac/require-permission";
import { reindex, removeFromIndex } from "@/lib/search";
import {
  computePath,
  recomputeSubtreePaths,
  snapshotVersion,
  createShareLink as createShareLinkLib,
} from "@/lib/documents/documents";
import {
  createEnvelope as createEnvelopeLib,
  sendEnvelope as sendEnvelopeLib,
  voidEnvelope as voidEnvelopeLib,
  type SignerInput,
} from "@/lib/documents/envelopes";

// ---------------------------------------------------------------- Folders

export async function createFolder(input: { name: string; parentId?: string | null }): Promise<string> {
  await requirePermission("record:create");
  const name = input.name?.trim();
  if (!name) throw new Error("Folder name is required.");
  const { db } = getTenantDb();
  const parentId = input.parentId || null;
  const path = await computePath(db, name, parentId);
  const folder = await db.docFolder.create({ data: { name, parentId, path } });
  await reindex(db, "DOC_FOLDER", folder.id).catch(() => undefined);
  revalidatePath("/app/documents");
  return folder.id;
}

export async function renameFolder(id: string, name: string): Promise<void> {
  await requirePermission("record:update");
  const clean = name?.trim();
  if (!clean) throw new Error("Folder name is required.");
  const { db } = getTenantDb();
  await db.docFolder.update({ where: { id }, data: { name: clean } });
  await recomputeSubtreePaths(db, id);
  await reindex(db, "DOC_FOLDER", id).catch(() => undefined);
  revalidatePath("/app/documents");
}

export async function moveFolder(id: string, parentId: string | null): Promise<void> {
  await requirePermission("record:update");
  if (id === parentId) throw new Error("A folder cannot be its own parent.");
  const { db } = getTenantDb();
  await db.docFolder.update({ where: { id }, data: { parentId: parentId || null } });
  await recomputeSubtreePaths(db, id);
  await reindex(db, "DOC_FOLDER", id).catch(() => undefined);
  revalidatePath("/app/documents");
}

export async function deleteFolder(id: string): Promise<void> {
  await requirePermission("record:delete");
  const { db } = getTenantDb();
  await db.docFolder.delete({ where: { id } });
  await removeFromIndex(db, "DOC_FOLDER", id).catch(() => undefined);
  revalidatePath("/app/documents");
}

// ---------------------------------------------------------------- Documents

export async function createDocument(input: {
  name: string;
  folderId?: string | null;
  kind?: "FILE" | "DOC";
  mimeType?: string | null;
  storageKey?: string | null;
  bodyHtml?: string | null;
  sizeBytes?: number;
}): Promise<string> {
  await requirePermission("record:create");
  const name = input.name?.trim();
  if (!name) throw new Error("Document name is required.");
  const { db } = getTenantDb();
  const doc = await db.document.create({
    data: {
      name,
      folderId: input.folderId || null,
      kind: (input.kind ?? "FILE") as never,
      mimeType: input.mimeType ?? null,
      storageKey: input.storageKey ?? null,
      bodyHtml: input.bodyHtml ?? null,
      sizeBytes: input.sizeBytes ?? 0,
    },
  });
  await reindex(db, "DOCUMENT", doc.id).catch(() => undefined);
  revalidatePath("/app/documents");
  return doc.id;
}

export async function renameDocument(id: string, name: string): Promise<void> {
  await requirePermission("record:update");
  const clean = name?.trim();
  if (!clean) throw new Error("Document name is required.");
  const { db } = getTenantDb();
  await db.document.update({ where: { id }, data: { name: clean } });
  await reindex(db, "DOCUMENT", id).catch(() => undefined);
  revalidatePath("/app/documents");
  revalidatePath(`/app/documents/${id}`);
}

export async function moveDocument(id: string, folderId: string | null): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  await db.document.update({ where: { id }, data: { folderId: folderId || null } });
  revalidatePath("/app/documents");
  revalidatePath(`/app/documents/${id}`);
}

export async function deleteDocument(id: string): Promise<void> {
  await requirePermission("record:delete");
  const { db } = getTenantDb();
  await db.document.delete({ where: { id } });
  await removeFromIndex(db, "DOCUMENT", id).catch(() => undefined);
  revalidatePath("/app/documents");
}

/** Save the rich-text body of a DOC document, snapshotting the prior version. */
export async function saveDocumentBody(id: string, bodyHtml: string): Promise<number> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  const nextVersion = await snapshotVersion(db, id);
  await db.document.update({ where: { id }, data: { bodyHtml, version: nextVersion } });
  await reindex(db, "DOCUMENT", id).catch(() => undefined);
  revalidatePath(`/app/documents/${id}`);
  revalidatePath(`/app/documents/doc/${id}/edit`);
  return nextVersion;
}

// ---------------------------------------------------------------- Share links

export async function createShareLink(input: {
  documentId: string;
  password?: string | null;
  expiresAt?: string | null;
  allowDownload?: boolean;
}): Promise<{ token: string }> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  const { token } = await createShareLinkLib(db, {
    documentId: input.documentId,
    password: input.password || null,
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    allowDownload: input.allowDownload ?? true,
  });
  revalidatePath(`/app/documents/${input.documentId}`);
  return { token };
}

export async function deleteShareLink(id: string, documentId: string): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  await db.documentShareLink.delete({ where: { id } });
  revalidatePath(`/app/documents/${documentId}`);
}

// ---------------------------------------------------------------- Envelopes

export async function createEnvelopeAction(input: {
  name: string;
  documentId: string;
  message?: string | null;
  signers: SignerInput[];
  send?: boolean;
}): Promise<{ id: string }> {
  await requirePermission("record:create");
  const name = input.name?.trim();
  if (!name) throw new Error("Envelope name is required.");
  if (!input.documentId) throw new Error("A document is required.");
  const signers = (input.signers ?? []).filter((s) => s.name?.trim() && s.email?.trim());
  if (signers.length === 0) throw new Error("At least one signer is required.");
  const { db } = getTenantDb();
  const id = await createEnvelopeLib(db, {
    name,
    documentId: input.documentId,
    message: input.message ?? null,
    signers,
  });
  if (input.send) await sendEnvelopeLib(db, id);
  revalidatePath("/app/documents/envelopes");
  return { id };
}

export async function sendEnvelopeAction(id: string): Promise<{ detail: string }> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  const res = await sendEnvelopeLib(db, id);
  if (!res.ok) throw new Error(res.detail);
  revalidatePath("/app/documents/envelopes");
  revalidatePath(`/app/documents/envelopes/${id}`);
  return { detail: res.detail };
}

export async function voidEnvelopeAction(id: string): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  const res = await voidEnvelopeLib(db, id);
  if (!res.ok) throw new Error(res.detail);
  revalidatePath("/app/documents/envelopes");
  revalidatePath(`/app/documents/envelopes/${id}`);
}
