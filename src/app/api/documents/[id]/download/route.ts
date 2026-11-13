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
import { requirePermission, getCurrentMembership, PermissionError } from "@/lib/rbac/require-permission";
import {auditedHistoricalTenantRead} from "@/lib/chess/historical-sensitive-read";
import { activeProvider, downloadUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission("record:read");
    const { db } = getTenantDb();
    const member=await getCurrentMembership();
    if(!member)throw new PermissionError("record:read");
    const doc=await auditedHistoricalTenantRead(db,{
      actorClerkUserId:member.clerkUserId,
      action:"HISTORICAL_DOCUMENT_DOWNLOAD_READ",
      resourceType:"Document",resourceId:params.id,
      // Legacy document-level ACL does not prove MEMBER scope. Deny by default.
      allowedRoles:["OWNER","ADMIN"],
    },tx=>tx.document.findUnique({where:{id:params.id},
      select:{id:true,name:true,storageKey:true}}));
    if (!doc) return NextResponse.json({ ok: false, error: "Document not found." }, { status: 404 });
    if (!doc.storageKey) {
      return NextResponse.json({ ok: false, error: "This document has no downloadable file." }, { status: 400 });
    }
    const url = await downloadUrl(activeProvider(), doc.storageKey, {
      contentDisposition: `attachment; filename="${doc.name}"`,
    });
    const response=NextResponse.redirect(url.startsWith("http") ? url : new URL(url, _req.url));
    response.headers.set("Cache-Control","private, no-store");
    response.headers.set("X-Content-Type-Options","nosniff");
    return response;
  } catch (err) {
    if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
    if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
    return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
