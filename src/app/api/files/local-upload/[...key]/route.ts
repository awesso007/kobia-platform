import { NextResponse, type NextRequest } from "next/server";
import { writeLocalObject } from "@/lib/storage/local";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";

export const dynamic = "force-dynamic";

/*
 * LOCAL upload sink (Sprint 8 dev fallback). The client PUTs raw bytes here for
 * the storageKey returned by /api/files/upload-url. This is the LOCAL analogue
 * of a presigned S3 PUT, so it does NOT call requirePermission - it validates
 * that the key matches an existing UPLOADING File row in the current tenant
 * before writing, which is the storage policy gate.
 */
export async function PUT(req: NextRequest, { params }: { params: { key: string[] } }) {
  const storageKey = decodeURIComponent(params.key.join("/"));
  try {
    const { db } = getTenantDb();
    const file = await db.file.findUnique({ where: { storageKey } });
    if (!file || file.storageProvider !== "LOCAL") {
      return NextResponse.json({ ok: false, error: "Unknown storage key." }, { status: 404 });
    }
    if (file.status !== "UPLOADING") {
      return NextResponse.json({ ok: false, error: "File is not awaiting upload." }, { status: 409 });
    }
    const buf = Buffer.from(await req.arrayBuffer());
    await writeLocalObject(storageKey, buf);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
    return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
