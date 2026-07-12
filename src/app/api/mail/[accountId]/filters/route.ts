/*
 * POST /api/mail/[accountId]/filters (Sprint 23) - create a filter rule.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { createFilter } from "@/lib/mail/mutations";
import type { FilterCondition, FilterAction } from "@/lib/mail/filters";
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
    if (!name) return NextResponse.json({ ok: false, error: "Filter name is required." }, { status: 400 });
    if (!body.condition || !body.action) {
      return NextResponse.json({ ok: false, error: "condition and action are required." }, { status: 400 });
    }
    const filter = await createFilter(db, account.id, {
      name,
      condition: body.condition as FilterCondition,
      action: body.action as FilterAction,
      enabled: body.enabled != null ? Boolean(body.enabled) : undefined,
    });
    return NextResponse.json({ ok: true, filter }, { status: 201 });
  } catch (err) {
    return failMail(err);
  }
}
