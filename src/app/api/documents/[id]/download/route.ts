/*
 * Authenticated document download endpoint (Sprint 14). Resolves a presigned (or
 * local) download URL for a FILE document's stored object and redirects to it.
 * DOC documents have no stored object (their content is bodyHtml) so they return
 * 400. Enforces requirePermission.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError } from "@/lib/rbac/require-permission";
import { activeProvider, downloadUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission("record:read");
    const { db } = getTenantDb();
    const doc = await db.document.findUnique({ where: { id: params.id } });
    if (!doc) return NextResponse.json({ ok: false, error: "Document not found." }, { status: 404 });
    if (!doc.storageKey) {
      return NextResponse.json({ ok: false, error: "This document has no downloadable file." }, { status: 400 });
    }
    const url = await downloadUrl(activeProvider(), doc.storageKey, {
      contentDisposition: `attachment; filename="${doc.name}"`,
    });
    return NextResponse.redirect(url.startsWith("http") ? url : new URL(url, _req.url));
  } catch (err) {
    if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
    if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
    return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
