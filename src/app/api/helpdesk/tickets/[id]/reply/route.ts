/*
 * Ticket reply API (Sprint 15, authenticated). POST adds an agent reply or
 * internal note to a ticket via addMessage (which handles first-response
 * stamping and status transitions).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError } from "@/lib/rbac/require-permission";
import { addMessage } from "@/lib/helpdesk/tickets";

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
    await requirePermission("record:update");
    const bodyHtml = String(body.bodyHtml ?? "").trim();
    if (!bodyHtml) return NextResponse.json({ ok: false, error: "Reply body is required." }, { status: 400 });
    const { db } = getTenantDb();
    const messageId = await addMessage(db, {
      ticketId: params.id,
      authorType: "AGENT",
      authorName: String(body.authorName ?? "").trim() || "Agent",
      bodyHtml,
      isInternal: Boolean(body.isInternal),
    });
    if (!messageId) return NextResponse.json({ ok: false, error: "Ticket not found." }, { status: 404 });
    return NextResponse.json({ ok: true, messageId }, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}
