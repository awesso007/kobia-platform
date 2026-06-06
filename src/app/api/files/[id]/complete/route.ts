import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, getCurrentMembership, PermissionError } from "@/lib/rbac/require-permission";
import { auditWrite } from "@/lib/crm/audit";
import { dispatchAutomation } from "@/lib/automations/dispatch";
import { completeUpload, dispatchEntityFor, type FileEntity } from "@/lib/files/files";
import { readLocalObject } from "@/lib/storage/local";

export const dynamic = "force-dynamic";

type Body = { entityType?: FileEntity; entityId?: string };

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    // empty body is allowed (file with no attachment)
  }

  try {
    await requirePermission("record:create");
    const { db } = getTenantDb();
    const member = await getCurrentMembership();

    const existing = await db.file.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ ok: false, error: "File not found." }, { status: 404 });

    const localBytes =
      existing.storageProvider === "LOCAL" ? await readLocalObject(existing.storageKey) : null;

    const result = await completeUpload(db, params.id, {
      entityType: body.entityType ?? null,
      entityId: body.entityId ?? null,
      attachedByClerkUserId: member?.clerkUserId ?? null,
      localBytes,
    });
    if (!result.ok) return NextResponse.json(result, { status: 400 });

    await auditWrite({ action: "CREATE", entityType: "COMPANY", entityId: params.id, diff: { file: result.file?.name } });

    // Fire FILE_UPLOADED. If the upload was attached to a CRM record, target
    // that record so automations can react (e.g. attach a welcome brochure).
    const dispatchEntity = body.entityType ? dispatchEntityFor(body.entityType) : null;
    if (dispatchEntity && body.entityId) {
      await dispatchAutomation({
        type: "FILE_UPLOADED",
        entityType: dispatchEntity,
        entityId: body.entityId,
        payload: { fileId: params.id, fileName: result.file?.name },
      });
    }

    return NextResponse.json({ ok: true, file: result.file });
  } catch (err) {
    if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
    if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
    return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
