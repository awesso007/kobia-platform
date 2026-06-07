/*
 * Documents read queries (Sprint 14, server-only). All reads go through
 * getTenantDb(). Listing helpers for the folder browser, document detail,
 * envelope list, and envelope detail.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantDb } from "@/lib/db/get-tenant-db";

export type FolderRow = { id: string; name: string; path: string; childCount: number; docCount: number };
export type DocRow = {
  id: string;
  name: string;
  kind: string;
  mimeType: string | null;
  sizeBytes: number;
  version: number;
  updatedAt: Date;
};

/** Browse one folder level: subfolders + documents directly inside `folderId`. */
export async function browseFolder(folderId: string | null): Promise<{
  folder: { id: string; name: string; path: string; parentId: string | null } | null;
  folders: FolderRow[];
  documents: DocRow[];
}> {
  const { db } = getTenantDb();
  const folder = folderId
    ? await db.docFolder.findUnique({
        where: { id: folderId },
        select: { id: true, name: true, path: true, parentId: true },
      })
    : null;

  const subfolders = await db.docFolder.findMany({
    where: { parentId: folderId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, path: true },
  });
  const folders: FolderRow[] = await Promise.all(
    subfolders.map(async (f) => ({
      ...f,
      childCount: await db.docFolder.count({ where: { parentId: f.id } }),
      docCount: await db.document.count({ where: { folderId: f.id } }),
    })),
  );

  const docs = await db.document.findMany({
    where: { folderId: folderId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, kind: true, mimeType: true, sizeBytes: true, version: true, updatedAt: true },
  });

  return { folder, folders, documents: docs };
}

/** All folders (for move/destination pickers). */
export async function listAllFolders(): Promise<Array<{ id: string; name: string; path: string }>> {
  const { db } = getTenantDb();
  return db.docFolder.findMany({ orderBy: { path: "asc" }, select: { id: true, name: true, path: true } });
}

export async function getDocument(id: string) {
  const { db } = getTenantDb();
  return db.document.findUnique({
    where: { id },
    include: {
      folder: { select: { id: true, name: true, path: true } },
      versions: { orderBy: { version: "desc" } },
      shareLinks: { orderBy: { createdAt: "desc" } },
      permissions: true,
      envelopes: { orderBy: { createdAt: "desc" }, select: { id: true, name: true, status: true, createdAt: true } },
    },
  });
}

/** Documents that can be wrapped in an envelope (for the envelope wizard). */
export async function listDocumentsForPicker(): Promise<Array<{ id: string; name: string; kind: string }>> {
  const { db } = getTenantDb();
  return db.document.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, kind: true } });
}

export type EnvelopeRow = {
  id: string;
  name: string;
  status: string;
  documentName: string;
  signerCount: number;
  signedCount: number;
  sentAt: Date | null;
  updatedAt: Date;
};

export async function listEnvelopes(): Promise<EnvelopeRow[]> {
  const { db } = getTenantDb();
  const rows = await db.envelope.findMany({
    orderBy: { updatedAt: "desc" },
    include: { document: { select: { name: true } }, signers: { select: { status: true } } },
  });
  return rows.map((e) => ({
    id: e.id,
    name: e.name,
    status: e.status,
    documentName: e.document?.name ?? "(deleted)",
    signerCount: e.signers.length,
    signedCount: e.signers.filter((s) => s.status === "SIGNED").length,
    sentAt: e.sentAt,
    updatedAt: e.updatedAt,
  }));
}

export async function getEnvelope(id: string) {
  const { db } = getTenantDb();
  return db.envelope.findUnique({
    where: { id },
    include: {
      document: { select: { id: true, name: true } },
      signers: { orderBy: { order: "asc" } },
      auditEvents: { orderBy: { createdAt: "asc" } },
    },
  });
}
