/*
 * POST /api/mail/[accountId]/send (Sprint 23) - send a message via the Sprint 6
 * SMTP path, file the result in SENT, and delete the source draft if provided.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { sendMail } from "@/lib/mail/mutations";
import { resolveMail, failMail } from "@/lib/mail/api";

export const dynamic = "force-dynamic";

function toList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof v === "string") return v.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

export async function POST(req: NextRequest, { params }: { params: { accountId: string } }) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  try {
    const { db, account } = await resolveMail(params.accountId, "record:update");
    const to = toList(body.to);
    if (to.length === 0) return NextResponse.json({ ok: false, error: "At least one recipient is required." }, { status: 400 });
    const result = await sendMail(db, account.id, {
      to,
      cc: toList(body.cc),
      bcc: toList(body.bcc),
      subject: String(body.subject ?? ""),
      body: String(body.body ?? ""),
      inReplyTo: body.inReplyTo ? String(body.inReplyTo) : null,
      draftId: body.draftId ? String(body.draftId) : null,
    });
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error ?? "Send failed." }, { status: 502 });
    return NextResponse.json({ ok: true, messageId: result.messageId, threadId: result.threadId });
  } catch (err) {
    return failMail(err);
  }
}
