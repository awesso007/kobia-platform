/*
 * Site themes API (Sprint 17, authenticated). Themes are tenant-wide and shared
 * across sites. GET lists them; POST upserts (create or update by id) and can
 * set the default. Guarded by RBAC, tenant via getTenantDb().
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError } from "@/lib/rbac/require-permission";
import { listThemes } from "@/lib/sites/queries";
import { upsertTheme } from "@/lib/sites/mutations";

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
    const themes = await listThemes(db);
    return NextResponse.json({ ok: true, themes });
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
    await requirePermission("record:update");
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ ok: false, error: "Name is required." }, { status: 400 });
    const { db } = getTenantDb();
    const id = await upsertTheme(db, {
      id: (body.id as string) || null,
      name,
      tokens: body.tokens ?? {},
      isDefault: Boolean(body.isDefault),
    });
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}
