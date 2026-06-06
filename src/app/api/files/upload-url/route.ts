import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, getCurrentMembership, PermissionError } from "@/lib/rbac/require-permission";
import { prepareUpload } from "@/lib/storage";
import type { FileEntity } from "@/lib/files/files";

export const dynamic = "force-dynamic";

type Body = {
  fileName?: string;
  mimeType?: string;
  size?: number;
  entityType?: FileEntity;
  entityId?: string;
  folderId?: string | null;
};

/** Best-effort tenant slug from the bound schema name (tenant_acme -> acme). */
function slugFromSchema(schemaName: string): string {
  return schemaName.replace(/^tenant_/, "").replace(/_/g, "-");
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  if (!body.fileName || !body.mimeType) {
    return NextResponse.json({ ok: false, error: "fileName and mimeType are required." }, { status: 400 });
  }

  try {
    await requirePermission("record:create");
    const { db, schemaName } = getTenantDb();
    const member = await getCurrentMembership();
    const tenantSlug = slugFromSchema(schemaName);

    const prepared = await prepareUpload({
      tenantSlug,
      fileName: body.fileName,
      mimeType: body.mimeType,
      size: Number(body.size ?? 0),
    });

    const file = await db.file.create({
      data: {
        name: body.fileName,
        mimeType: body.mimeType,
        size: BigInt(Math.max(0, Number(body.size ?? 0))),
        storageProvider: prepared.provider as never,
        storageKey: prepared.storageKey,
        storageBucket: prepared.storageBucket,
        status: "UPLOADING",
        folderId: body.folderId ?? null,
        source: "MANUAL",
        uploadedByClerkUserId: member?.clerkUserId ?? null,
      },
    });

    return NextResponse.json({
      ok: true,
      fileId: file.id,
      uploadUrl: prepared.uploadUrl,
      uploadMethod: prepared.uploadMethod,
      provider: prepared.provider,
    });
  } catch (err) {
    if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
    if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
    return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
