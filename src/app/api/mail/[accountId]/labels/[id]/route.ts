/*
 * PATCH  /api/mail/[accountId]/labels/[id] (Sprint 23) - rename/recolor a label.
 * DELETE /api/mail/[accountId]/labels/[id] (Sprint 23) - delete a label.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { updateLabel, deleteLabel } from "@/lib/mail/mutations";
import { resolveMail, failMail } from "@/lib/mail/api";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { accountId: string; id: string } }) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  try {
    const { db, account } = await resolveMail(params.accountId, "record:update");
    const label = await updateLabel(db, account.id, params.id, {
      name: body.name != null ? String(body.name) : undefined,
      color: body.color != null ? String(body.color) : undefined,
    });
    if (!label) return NextResponse.json({ ok: false, error: "Label not found." }, { status: 404 });
    return NextResponse.json({ ok: true, label });
  } catch (err) {
    return failMail(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: { accountId: string; id: string } }) {
  try {
    const { db, account } = await resolveMail(params.accountId, "record:update");
    await deleteLabel(db, account.id, params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return failMail(err);
  }
}
