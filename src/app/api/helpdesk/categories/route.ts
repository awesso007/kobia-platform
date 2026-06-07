/*
 * Ticket categories API (Sprint 15, authenticated). GET lists categories; POST
 * creates one (optionally mapped to an SLA policy).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError } from "@/lib/rbac/require-permission";

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
    const categories = await db.ticketCategory.findMany({ orderBy: { name: "asc" } });
    return NextResponse.json({ ok: true, categories });
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
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ ok: false, error: "Category name is required." }, { status: 400 });
    const { db } = getTenantDb();
    const cat = await db.ticketCategory.create({
      data: {
        name,
        description: String(body.description ?? "").trim() || null,
        slaPolicyId: (body.slaPolicyId as string) || null,
        color: String(body.color ?? "").trim() || null,
      },
    });
    return NextResponse.json({ ok: true, id: cat.id }, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}
