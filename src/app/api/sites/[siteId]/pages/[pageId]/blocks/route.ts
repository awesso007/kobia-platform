/*
 * Page blocks API (Sprint 17, authenticated). POST creates a block; PATCH
 * either reorders the page's blocks (when `orderedIds` is sent) or updates a
 * single block's data/visibility (when `blockId` is sent); DELETE removes a
 * block. Guarded by RBAC, tenant via getTenantDb().
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError } from "@/lib/rbac/require-permission";
import { createBlock, updateBlock, deleteBlock, reorderBlocks } from "@/lib/sites/mutations";
import { isBlockType } from "@/lib/sites/blocks";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

export async function POST(req: NextRequest, { params }: { params: { siteId: string; pageId: string } }) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  try {
    await requirePermission("record:create");
    const type = String(body.type ?? "");
    if (!isBlockType(type)) return NextResponse.json({ ok: false, error: "Invalid block type." }, { status: 400 });
    const { db } = getTenantDb();
    const id = await createBlock(db, params.pageId, type, body.data);
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { siteId: string; pageId: string } }) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  try {
    await requirePermission("record:update");
    const { db } = getTenantDb();
    if (Array.isArray(body.orderedIds)) {
      await reorderBlocks(db, params.pageId, (body.orderedIds as unknown[]).map(String));
      return NextResponse.json({ ok: true });
    }
    const blockId = String(body.blockId ?? "");
    if (!blockId) return NextResponse.json({ ok: false, error: "blockId is required." }, { status: 400 });
    await updateBlock(db, blockId, {
      data: body.data,
      visible: body.visible as boolean | undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { siteId: string; pageId: string } }) {
  try {
    await requirePermission("record:delete");
    const blockId = req.nextUrl.searchParams.get("blockId") ?? "";
    if (!blockId) return NextResponse.json({ ok: false, error: "blockId is required." }, { status: 400 });
    const { db } = getTenantDb();
    await deleteBlock(db, blockId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
