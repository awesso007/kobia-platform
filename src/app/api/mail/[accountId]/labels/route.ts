/*
 * POST /api/mail/[accountId]/labels (Sprint 23) - create a label.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { createLabel } from "@/lib/mail/mutations";
import { resolveMail, failMail } from "@/lib/mail/api";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { accountId: string } }) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  try {
    const { db, account } = await resolveMail(params.accountId, "record:create");
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ ok: false, error: "Label name is required." }, { status: 400 });
    const color = body.color != null ? String(body.color) : undefined;
    const label = await createLabel(db, account.id, name, color);
    return NextResponse.json({ ok: true, label }, { status: 201 });
  } catch (err) {
    return failMail(err);
  }
}
