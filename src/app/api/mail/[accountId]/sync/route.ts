/*
 * POST /api/mail/[accountId]/sync (Sprint 23) - trigger an IMAP sync now by
 * wrapping the existing Sprint 6 syncAccount function.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse } from "next/server";
import { syncAccount } from "@/lib/email/imap-sync";
import { resolveMail, failMail } from "@/lib/mail/api";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { accountId: string } }) {
  try {
    const { db, account } = await resolveMail(params.accountId, "record:update");
    const result = await syncAccount(db, account);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return failMail(err);
  }
}
