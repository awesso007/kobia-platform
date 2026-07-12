/*
 * GET  /api/mail/[accountId]/drafts - list drafts (newest first).
 * POST /api/mail/[accountId]/drafts - create/update a draft (autosave).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { listDrafts } from "@/lib/mail/queries";
import { saveDraft } from "@/lib/mail/mutations";
import { resolveMail, failMail } from "@/lib/mail/api";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { accountId: string } }) {
  try {
    const { db, account } = await resolveMail(params.accountId, "record:read");
    const drafts = await listDrafts(db, account.id);
    return NextResponse.json({ ok: true, drafts });
  } catch (err) {
    return failMail(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: { accountId: string } }) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  try {
    const { db, account } = await resolveMail(params.accountId, "record:create");
    const id = await saveDraft(db, account.id, {
      id: body.id ? String(body.id) : null,
      threadId: body.threadId ? String(body.threadId) : null,
      to: body.to != null ? String(body.to) : null,
      cc: body.cc != null ? String(body.cc) : null,
      bcc: body.bcc != null ? String(body.bcc) : null,
      subject: body.subject != null ? String(body.subject) : null,
      body: body.body != null ? String(body.body) : null,
      attachments: body.attachments ?? null,
      inReplyTo: body.inReplyTo ? String(body.inReplyTo) : null,
    });
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (err) {
    return failMail(err);
  }
}
