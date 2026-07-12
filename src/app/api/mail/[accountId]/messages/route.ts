/*
 * GET  /api/mail/[accountId]/messages - cursor-paginated list for a folder /
 *       label / thread / search query.
 * PATCH /api/mail/[accountId]/messages - bulk flag update ({ids, folder?,
 *       isRead?, isStarred?}). Single-message updates use the [id] route.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import type { EmailFolder } from "@/lib/db/generated/tenant";
import { listMessages } from "@/lib/mail/queries";
import { updateMessageFlags } from "@/lib/mail/mutations";
import { resolveMail, failMail } from "@/lib/mail/api";

export const dynamic = "force-dynamic";

const FOLDERS: EmailFolder[] = ["INBOX", "SENT", "DRAFTS", "ARCHIVE", "SPAM", "TRASH"];

export async function GET(req: NextRequest, { params }: { params: { accountId: string } }) {
  try {
    const { db, account } = await resolveMail(params.accountId, "record:read");
    const sp = req.nextUrl.searchParams;
    const rawFolder = sp.get("folder");
    const folder = rawFolder && FOLDERS.includes(rawFolder as EmailFolder) ? (rawFolder as EmailFolder) : null;
    const result = await listMessages(db, {
      accountId: account.id,
      folder,
      labelId: sp.get("labelId"),
      threadId: sp.get("threadId"),
      q: sp.get("q"),
      cursor: sp.get("cursor"),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return failMail(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { accountId: string } }) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  try {
    const { db, account } = await resolveMail(params.accountId, "record:update");
    const ids = Array.isArray(body.ids) ? (body.ids as unknown[]).map(String) : [];
    if (ids.length === 0) return NextResponse.json({ ok: false, error: "ids is required." }, { status: 400 });
    const rawFolder = body.folder ? String(body.folder) : undefined;
    const res = await updateMessageFlags(db, account.id, ids, {
      folder: rawFolder && FOLDERS.includes(rawFolder as EmailFolder) ? (rawFolder as EmailFolder) : undefined,
      isRead: typeof body.isRead === "boolean" ? body.isRead : undefined,
      isStarred: typeof body.isStarred === "boolean" ? body.isStarred : undefined,
    });
    return NextResponse.json({ ok: true, count: res.count });
  } catch (err) {
    return failMail(err);
  }
}
