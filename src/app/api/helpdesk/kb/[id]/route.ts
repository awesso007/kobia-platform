/*
 * Single KB article API (Sprint 15, authenticated). PATCH updates via
 * upsertArticle; DELETE removes the article and its search index entry.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError } from "@/lib/rbac/require-permission";
import { removeFromIndex } from "@/lib/search";
import { upsertArticle, type UpsertArticleInput } from "@/lib/helpdesk/kb";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  try {
    await requirePermission("record:update");
    const title = String(body.title ?? "").trim();
    if (!title) return NextResponse.json({ ok: false, error: "Title is required." }, { status: 400 });
    const { db } = getTenantDb();
    const id = await upsertArticle(db, {
      id: params.id,
      title,
      bodyHtml: String(body.bodyHtml ?? ""),
      summary: String(body.summary ?? "").trim() || null,
      categoryId: (body.categoryId as string) || null,
      status: body.status as UpsertArticleInput["status"],
      visibility: body.visibility as UpsertArticleInput["visibility"],
    });
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requirePermission("record:delete");
    const { db } = getTenantDb();
    await db.kbArticle.delete({ where: { id: params.id } });
    await removeFromIndex(db, "KB_ARTICLE", params.id).catch(() => undefined);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
