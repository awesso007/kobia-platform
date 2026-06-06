/*
 * LOCAL storage fallback (Sprint 8). Used when S3 is not configured. Files are
 * written under /tmp/kobia-files and served back through /api/files/local. This
 * is a dev convenience only - /tmp is ephemeral on serverless hosts.
 *
 * Storage keys use the same tenants/<slug>/<yyyy>/<mm>/<uuid>__<name> shape as
 * S3 so the rest of the app does not care which provider produced a key. The
 * key is mapped to a path under LOCAL_ROOT; path traversal is rejected.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { mkdir, writeFile, readFile, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { buildStorageKey } from "./s3";

export const LOCAL_ROOT = "/tmp/kobia-files";

export function buildLocalStorageKey(tenantSlug: string, fileName: string): string {
  return buildStorageKey(tenantSlug, fileName);
}

/** Resolve a storage key to an absolute path under LOCAL_ROOT, rejecting traversal. */
export function pathForKey(storageKey: string): string {
  const normalized = path.normalize(storageKey).replace(/^(\.\.(\/|\\|$))+/, "");
  const full = path.join(LOCAL_ROOT, normalized);
  if (!full.startsWith(LOCAL_ROOT + path.sep) && full !== LOCAL_ROOT) {
    throw new Error("Invalid storage key.");
  }
  return full;
}

export async function writeLocalObject(storageKey: string, data: Buffer): Promise<void> {
  const full = pathForKey(storageKey);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
}

export async function readLocalObject(storageKey: string): Promise<Buffer | null> {
  try {
    return await readFile(pathForKey(storageKey));
  } catch {
    return null;
  }
}

export async function headLocalObject(storageKey: string): Promise<{ size: number } | null> {
  try {
    const s = await stat(pathForKey(storageKey));
    return { size: s.size };
  } catch {
    return null;
  }
}

export async function deleteLocalObject(storageKey: string): Promise<void> {
  try {
    await unlink(pathForKey(storageKey));
  } catch {
    // already gone - fine
  }
}
