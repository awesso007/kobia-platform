/*
 * PATCH  /api/mail/[accountId]/signatures/[id] (Sprint 23) - update a signature.
 * DELETE /api/mail/[accountId]/signatures/[id] (Sprint 23) - delete a signature.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { updateSignature, deleteSignature } from "@/lib/mail/mutations";
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
    const signature = await updateSignature(db, account.id, params.id, {
      name: body.name != null ? String(body.name) : undefined,
      html: body.html != null ? String(body.html) : undefined,
      isDefault: body.isDefault != null ? Boolean(body.isDefault) : undefined,
    });
    if (!signature) return NextResponse.json({ ok: false, error: "Signature not found." }, { status: 404 });
    return NextResponse.json({ ok: true, signature });
  } catch (err) {
    return failMail(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: { accountId: string; id: string } }) {
  try {
    const { db, account } = await resolveMail(params.accountId, "record:update");
    await deleteSignature(db, account.id, params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return failMail(err);
  }
}
