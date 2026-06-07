/*
 * Authenticated upload-new-version endpoint (Sprint 14). POST snapshots the
 * current document into DocumentVersion, increments the version, and applies the
 * provided new content (storageKey/mimeType/sizeBytes for FILE docs, or bodyHtml
 * for DOC docs). Enforces requirePermission and reindexes search.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError } from "@/lib/rbac/require-permission";
import { snapshotVersion } from "@/lib/documents/documents";
import { reindex } from "@/lib/search";

export const dynamic = "force-dynamic";

type Body = {
  storageKey?: string | null;
  mimeType?: string | null;
  sizeBytes?: number;
  bodyHtml?: string | null;
  name?: string | null;
};

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    body = {};
  }

  try {
    await requirePermission("record:update");
    const { db } = getTenantDb();
    const existing = await db.document.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ ok: false, error: "Document not found." }, { status: 404 });

    const nextVersion = await snapshotVersion(db, params.id);
    const updated = await db.document.update({
      where: { id: params.id },
      data: {
        version: nextVersion,
        ...(body.name != null ? { name: body.name } : {}),
        ...(body.storageKey !== undefined ? { storageKey: body.storageKey } : {}),
        ...(body.mimeType !== undefined ? { mimeType: body.mimeType } : {}),
        ...(body.sizeBytes !== undefined ? { sizeBytes: body.sizeBytes } : {}),
        ...(body.bodyHtml !== undefined ? { bodyHtml: body.bodyHtml } : {}),
      },
    });
    await reindex(db, "DOCUMENT", params.id).catch(() => undefined);
    return NextResponse.json({ ok: true, version: updated.version });
  } catch (err) {
    if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
    if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
    return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
