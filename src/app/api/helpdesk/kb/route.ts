/*
 * Knowledge base API (Sprint 15, authenticated). GET lists all articles (any
 * status); POST creates one via upsertArticle (manages slug + publishedAt and
 * reindexes).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError } from "@/lib/rbac/require-permission";
import { upsertArticle, type UpsertArticleInput } from "@/lib/helpdesk/kb";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

export async function GET() {
  try {
    await requirePermission("record:read");
    const { db } = getTenantDb();
    const articles = await db.kbArticle.findMany({
      orderBy: { updatedAt: "desc" },
      include: { category: { select: { id: true, name: true } } },
    });
    return NextResponse.json({ ok: true, articles });
  } catch (err) {
    return fail(err);
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  try {
    await requirePermission("record:create");
    const title = String(body.title ?? "").trim();
    if (!title) return NextResponse.json({ ok: false, error: "Title is required." }, { status: 400 });
    const { db } = getTenantDb();
    const id = await upsertArticle(db, {
      title,
      bodyHtml: String(body.bodyHtml ?? ""),
      summary: String(body.summary ?? "").trim() || null,
      categoryId: (body.categoryId as string) || null,
      status: body.status as UpsertArticleInput["status"],
      visibility: body.visibility as UpsertArticleInput["visibility"],
    });
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}
