/*
 * PATCH /api/mail/[accountId]/messages/[id] (Sprint 23) - update one message's
 * flags ({folder?, isRead?, isStarred?, labelIds?}). Supports bulk when the body
 * carries {ids: []}, in which case the [id] path param is ignored. labelIds, when
 * present, replaces the message's full label set.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import type { EmailFolder } from "@/lib/db/generated/tenant";
import { updateMessageFlags, applyLabel, removeLabel } from "@/lib/mail/mutations";
import { resolveMail, failMail } from "@/lib/mail/api";

export const dynamic = "force-dynamic";

const FOLDERS: EmailFolder[] = ["INBOX", "SENT", "DRAFTS", "ARCHIVE", "SPAM", "TRASH"];

export async function PATCH(req: NextRequest, { params }: { params: { accountId: string; id: string } }) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  try {
    const { db, account } = await resolveMail(params.accountId, "record:update");
    const ids = Array.isArray(body.ids) && body.ids.length > 0 ? (body.ids as unknown[]).map(String) : [params.id];

    const rawFolder = body.folder ? String(body.folder) : undefined;
    await updateMessageFlags(db, account.id, ids, {
      folder: rawFolder && FOLDERS.includes(rawFolder as EmailFolder) ? (rawFolder as EmailFolder) : undefined,
      isRead: typeof body.isRead === "boolean" ? body.isRead : undefined,
      isStarred: typeof body.isStarred === "boolean" ? body.isStarred : undefined,
    });

    if (Array.isArray(body.labelIds)) {
      const desired = new Set((body.labelIds as unknown[]).map(String));
      for (const messageId of ids) {
        const current = await db.emailMessageLabel.findMany({ where: { messageId }, select: { labelId: true } });
        const currentSet = new Set(current.map((c) => c.labelId));
        for (const labelId of desired) if (!currentSet.has(labelId)) await applyLabel(db, account.id, messageId, labelId);
        for (const labelId of currentSet) if (!desired.has(labelId)) await removeLabel(db, account.id, messageId, labelId);
      }
    }

    return NextResponse.json({ ok: true, count: ids.length });
  } catch (err) {
    return failMail(err);
  }
}
