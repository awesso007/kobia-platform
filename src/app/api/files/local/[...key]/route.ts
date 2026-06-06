import { NextResponse, type NextRequest } from "next/server";
import { readLocalObject } from "@/lib/storage/local";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";

export const dynamic = "force-dynamic";

/*
 * LOCAL object serve (Sprint 8 dev fallback). Streams the bytes for a LOCAL
 * storageKey. Validates the key maps to a READY File row in the current tenant
 * before serving (the storage policy gate; no requirePermission so presigned-
 * style links work). Sets Content-Type and an inline/attachment disposition.
 */
export async function GET(req: NextRequest, { params }: { params: { key: string[] } }) {
  const storageKey = decodeURIComponent(params.key.join("/"));
  try {
    const { db } = getTenantDb();
    const file = await db.file.findUnique({ where: { storageKey } });
    if (!file || file.storageProvider !== "LOCAL" || file.status === "DELETED") {
      return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    }
    const bytes = await readLocalObject(storageKey);
    if (!bytes) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

    const inline = req.nextUrl.searchParams.get("inline") === "1";
    const disposition = `${inline ? "inline" : "attachment"}; filename="${file.name.replace(/"/g, "")}"`;
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": file.mimeType || "application/octet-stream",
        "Content-Disposition": disposition,
        "Content-Length": String(bytes.length),
      },
    });
  } catch (err) {
    if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
    return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
