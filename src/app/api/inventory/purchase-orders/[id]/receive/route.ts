/*
 * Purchase order receive action (Sprint 20, authenticated). POST accepts
 * {items:[{itemId, receivedQuantity}]}, records RECEIPT movements into the PO
 * warehouse, bumps received quantities, and transitions the PO to PARTIAL or
 * RECEIVED. Fires PURCHASE_ORDER_RECEIVED when fully received. RBAC inventory:manage.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError, getCurrentMembership } from "@/lib/rbac/require-permission";
import { poReceive } from "@/lib/inventory/stock";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  try {
    await requirePermission("inventory:manage");
    const { db } = getTenantDb();
    const member = await getCurrentMembership();
    const lines = Array.isArray(body.items)
      ? (body.items as { itemId: string; receivedQuantity: number }[]).map((i) => ({
          itemId: String(i.itemId),
          receivedQuantity: Number(i.receivedQuantity),
        }))
      : [];
    const result = await poReceive(db, params.id, lines, member?.clerkUserId ?? null);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return fail(err);
  }
}
