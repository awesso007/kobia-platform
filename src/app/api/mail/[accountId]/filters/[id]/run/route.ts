/*
 * POST /api/mail/[accountId]/filters/[id]/run (Sprint 23) - apply a filter
 * retroactively to the account's existing INBOX messages.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse } from "next/server";
import { runFilter } from "@/lib/mail/mutations";
import { resolveMail, failMail } from "@/lib/mail/api";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { accountId: string; id: string } }) {
  try {
    const { db, account } = await resolveMail(params.accountId, "record:update");
    const result = await runFilter(db, account.id, params.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return failMail(err);
  }
}
