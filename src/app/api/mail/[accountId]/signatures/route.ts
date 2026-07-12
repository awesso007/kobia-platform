/*
 * POST /api/mail/[accountId]/signatures (Sprint 23) - create a signature.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { createSignature } from "@/lib/mail/mutations";
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
    if (!name) return NextResponse.json({ ok: false, error: "Signature name is required." }, { status: 400 });
    const signature = await createSignature(db, account.id, account.ownerClerkUserId, {
      name,
      html: String(body.html ?? ""),
      isDefault: body.isDefault != null ? Boolean(body.isDefault) : undefined,
    });
    return NextResponse.json({ ok: true, signature }, { status: 201 });
  } catch (err) {
    return failMail(err);
  }
}
