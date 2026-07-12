/*
 * GET /api/mail/[accountId]/threads/[threadId] (Sprint 23) - all messages in a
 * thread, oldest first, for the thread reader.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse } from "next/server";
import { getThread } from "@/lib/mail/queries";
import { resolveMail, failMail } from "@/lib/mail/api";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { accountId: string; threadId: string } }) {
  try {
    const { db, account } = await resolveMail(params.accountId, "record:read");
    const data = await getThread(db, account.id, params.threadId);
    if (!data) return NextResponse.json({ ok: false, error: "Thread not found." }, { status: 404 });
    return NextResponse.json({ ok: true, ...data });
  } catch (err) {
    return failMail(err);
  }
}
