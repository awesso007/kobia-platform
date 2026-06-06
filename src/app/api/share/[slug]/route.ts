import { NextResponse, type NextRequest } from "next/server";
import { getTenantPrisma, schemaNameForSlug } from "@/lib/db/tenant-prisma";
import { verifySharePassword, fileDownloadUrl } from "@/lib/files/files";

export const dynamic = "force-dynamic";

/*
 * Public share-link download (Sprint 8). NO requirePermission - the slug is the
 * capability. Validates the link is not expired and not over its max-download
 * cap, checks the optional password, increments downloadCount, then 302s to the
 * storage download URL (presigned S3 GET or the LOCAL serve route).
 *
 * Tenant is resolved from a validated `?t=<slug>` query param (the public-form
 * convention). The share slug itself is unique only within a tenant schema.
 */
function sanitizeSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(slug) ? slug : null;
}

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const tParam = req.nextUrl.searchParams.get("t");
  const tenantSlug = sanitizeSlug(tParam);
  if (!tenantSlug) {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }

  let db;
  try {
    db = getTenantPrisma(schemaNameForSlug(tenantSlug));
  } catch {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }

  const link = await db.fileShareLink.findUnique({
    where: { slug: params.slug },
    include: { file: true },
  });
  if (!link || !link.file || link.file.status === "DELETED") {
    return NextResponse.json({ ok: false, error: "This link is no longer available." }, { status: 404 });
  }

  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ ok: false, error: "This link has expired." }, { status: 410 });
  }
  if (link.maxDownloads !== null && link.downloadCount >= link.maxDownloads) {
    return NextResponse.json({ ok: false, error: "This link has reached its download limit." }, { status: 410 });
  }

  if (link.password) {
    const provided = req.nextUrl.searchParams.get("password") ?? "";
    if (!provided || !verifySharePassword(provided, link.password)) {
      return NextResponse.json({ ok: false, error: "A valid password is required." }, { status: 401 });
    }
  }

  await db.fileShareLink.update({
    where: { id: link.id },
    data: { downloadCount: { increment: 1 } },
  });

  const inline = req.nextUrl.searchParams.get("inline") === "1";
  const url = await fileDownloadUrl(link.file, { inline, expiresIn: 60 * 60 });
  const absolute = url.startsWith("http") ? url : new URL(url, req.nextUrl.origin).toString();
  return NextResponse.redirect(absolute, 302);
}
