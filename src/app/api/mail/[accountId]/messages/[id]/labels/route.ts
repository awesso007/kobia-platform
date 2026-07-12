/*
 * POST /api/mail/[accountId]/messages/[id]/labels (Sprint 23) - attach a label
 * ({labelId}) to a message. Fires EMAIL_LABELED via mutations.applyLabel.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { applyLabel } from "@/lib/mail/mutations";
import { resolveMail, failMail } from "@/lib/mail/api";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { accountId: string; id: string } }) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  try {
    const { db, account } = await resolveMail(params.accountId, "record:update");
    const labelId = String(body.labelId ?? "");
    if (!labelId) return NextResponse.json({ ok: false, error: "labelId is required." }, { status: 400 });
    const res = await applyLabel(db, account.id, params.id, labelId);
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return failMail(err);
  }
}
