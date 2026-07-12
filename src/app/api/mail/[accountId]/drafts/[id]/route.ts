/*
 * PATCH  /api/mail/[accountId]/drafts/[id] - update a draft.
 * DELETE /api/mail/[accountId]/drafts/[id] - discard a draft.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { saveDraft, deleteDraft } from "@/lib/mail/mutations";
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
    const id = await saveDraft(db, account.id, {
      id: params.id,
      threadId: body.threadId ? String(body.threadId) : null,
      to: body.to != null ? String(body.to) : null,
      cc: body.cc != null ? String(body.cc) : null,
      bcc: body.bcc != null ? String(body.bcc) : null,
      subject: body.subject != null ? String(body.subject) : null,
      body: body.body != null ? String(body.body) : null,
      attachments: body.attachments ?? null,
      inReplyTo: body.inReplyTo ? String(body.inReplyTo) : null,
    });
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    return failMail(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: { accountId: string; id: string } }) {
  try {
    const { db, account } = await resolveMail(params.accountId, "record:update");
    await deleteDraft(db, account.id, params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return failMail(err);
  }
}
