/*
 * DELETE /api/mail/[accountId]/messages/[id]/labels/[labelId] (Sprint 23) -
 * detach a label from a message.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse } from "next/server";
import { removeLabel } from "@/lib/mail/mutations";
import { resolveMail, failMail } from "@/lib/mail/api";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: { accountId: string; id: string; labelId: string } }) {
  try {
    const { db, account } = await resolveMail(params.accountId, "record:update");
    const res = await removeLabel(db, account.id, params.id, params.labelId);
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return failMail(err);
  }
}
