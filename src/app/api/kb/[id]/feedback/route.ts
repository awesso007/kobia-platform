/*
 * Public KB feedback (Sprint 15). Unauthenticated. Tenant resolved from a
 * validated `?t=<slug>` query. Records a helpful/not-helpful vote on a published
 * article via recordFeedback (which also bumps the matching counter).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantPrisma, schemaNameForSlug } from "@/lib/db/tenant-prisma";
import { recordFeedback } from "@/lib/helpdesk/kb";

export const dynamic = "force-dynamic";

function sanitizeSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(slug) ? slug : null;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const tenant =
    sanitizeSlug(req.nextUrl.searchParams.get("t")) ?? sanitizeSlug(req.nextUrl.searchParams.get("tenant"));
  if (!tenant) return NextResponse.json({ ok: false, error: "Unknown workspace." }, { status: 400 });
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  try {
    const db = getTenantPrisma(schemaNameForSlug(tenant));
    const article = await db.kbArticle.findUnique({ where: { id: params.id } });
    if (!article || article.status !== "PUBLISHED" || article.visibility !== "PUBLIC") {
      return NextResponse.json({ ok: false, error: "Article not found." }, { status: 404 });
    }
    const ok = await recordFeedback(db, params.id, Boolean(body.helpful), String(body.comment ?? "").trim() || null);
    if (!ok) return NextResponse.json({ ok: false, error: "Article not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
