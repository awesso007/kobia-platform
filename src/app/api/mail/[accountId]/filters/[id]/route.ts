/*
 * PATCH  /api/mail/[accountId]/filters/[id] (Sprint 23) - update a filter rule.
 * DELETE /api/mail/[accountId]/filters/[id] (Sprint 23) - delete a filter rule.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { updateFilter, deleteFilter } from "@/lib/mail/mutations";
import type { FilterCondition, FilterAction } from "@/lib/mail/filters";
import { resolveMail, failMail } from "@/lib/mail/api";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { accountId: string; id: string } }) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  try {
    const { db, account } = await resolveMail(params.accountId, "record:update");
    const filter = await updateFilter(db, account.id, params.id, {
      name: body.name != null ? String(body.name) : undefined,
      condition: body.condition != null ? (body.condition as FilterCondition) : undefined,
      action: body.action != null ? (body.action as FilterAction) : undefined,
      enabled: body.enabled != null ? Boolean(body.enabled) : undefined,
    });
    if (!filter) return NextResponse.json({ ok: false, error: "Filter not found." }, { status: 404 });
    return NextResponse.json({ ok: true, filter });
  } catch (err) {
    return failMail(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: { accountId: string; id: string } }) {
  try {
    const { db, account } = await resolveMail(params.accountId, "record:update");
    await deleteFilter(db, account.id, params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return failMail(err);
  }
}
