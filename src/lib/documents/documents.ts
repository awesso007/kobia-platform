/*
 * Documents core logic (Sprint 14). Provider-agnostic helpers shared by the
 * Documents server actions, the upload-version API route, share-link viewers,
 * and the envelope/automation paths. Every function takes an explicit db so it
 * works both in a request scope (getTenantDb) and outside one (getTenantPrisma
 * by slug, used by public share viewers and crons).
 *
 * Folder paths are denormalized: DocFolder.path holds the full slash path
 * ("/Contracts/2026") so the browser can render breadcrumbs and search can
 * index a readable location without walking parents on every read. computePath
 * derives it from the parent and is called on create/rename/move.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import type { PrismaClient } from "@/lib/db/generated/tenant";
import { hashSharePassword, randomSlug } from "@/lib/files/files";

type Db = PrismaClient;

/** Strip HTML tags to a plain-text excerpt for search bodies and previews. */
export function htmlToText(html: string | null | undefined, max = 2000): string {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** Build the full slash path for a folder given its name and optional parent. */
export async function computePath(db: Db, name: string, parentId: string | null): Promise<string> {
  const clean = name.trim().replace(/\//g, "-") || "Untitled";
  if (!parentId) return `/${clean}`;
  const parent = await db.docFolder.findUnique({ where: { id: parentId }, select: { path: true } });
  const base = parent?.path ?? "";
  return `${base}/${clean}`;
}

/**
 * Recompute the path of a folder and all of its descendants. Called after a
 * rename or move so the denormalized path stays consistent for the whole
 * subtree. Walks breadth-first; safe for the modest folder depths we expect.
 */
export async function recomputeSubtreePaths(db: Db, folderId: string): Promise<void> {
  const folder = await db.docFolder.findUnique({ where: { id: folderId } });
  if (!folder) return;
  const path = await computePath(db, folder.name, folder.parentId);
  if (path !== folder.path) {
    await db.docFolder.update({ where: { id: folderId }, data: { path } });
  }
  const children = await db.docFolder.findMany({ where: { parentId: folderId }, select: { id: true } });
  for (const child of children) {
    await recomputeSubtreePaths(db, child.id);
  }
}

/**
 * Snapshot the current state of a document into DocumentVersion, then bump the
 * document version counter. Call this BEFORE writing the new content so the
 * snapshot captures the prior revision. Returns the new (incremented) version
 * number to write onto the Document row.
 */
export async function snapshotVersion(db: Db, documentId: string, createdById?: string | null): Promise<number> {
  const doc = await db.document.findUnique({ where: { id: documentId } });
  if (!doc) throw new Error("document not found");
  await db.documentVersion.create({
    data: {
      documentId: doc.id,
      version: doc.version,
      name: doc.name,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
      storageKey: doc.storageKey,
      bodyHtml: doc.bodyHtml,
      createdById: createdById ?? doc.updatedById ?? doc.createdById ?? null,
    },
  });
  return doc.version + 1;
}

/** Create a share link for a document. Hashes the password if one is given. */
export async function createShareLink(
  db: Db,
  input: {
    documentId: string;
    password?: string | null;
    expiresAt?: Date | null;
    allowDownload?: boolean;
    createdById?: string | null;
  },
): Promise<{ id: string; token: string }> {
  const token = randomSlug(16);
  const link = await db.documentShareLink.create({
    data: {
      documentId: input.documentId,
      token,
      password: input.password ? hashSharePassword(input.password) : null,
      expiresAt: input.expiresAt ?? null,
      allowDownload: input.allowDownload ?? true,
      createdById: input.createdById ?? null,
    },
    select: { id: true, token: true },
  });
  return link;
}

/** True when a share link is still usable (not past its expiresAt). */
export function isShareLinkLive(link: { expiresAt: Date | null }): boolean {
  return !link.expiresAt || link.expiresAt.getTime() > Date.now();
}
