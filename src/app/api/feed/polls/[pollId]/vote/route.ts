/*
 * Feed poll vote API (Sprint 21, authenticated). POST casts the caller's votes,
 * replacing any prior votes; single-choice unless the poll allows multiple.
 * Body: {optionIds: string[]}.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError, getCurrentMembership } from "@/lib/rbac/require-permission";
import { votePoll } from "@/lib/feed/mutations";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

export async function POST(req: NextRequest, { params }: { params: { pollId: string } }) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  try {
    await requirePermission("record:create");
    const optionIds = Array.isArray(body.optionIds) ? (body.optionIds as unknown[]).map((o) => String(o)) : [];
    if (optionIds.length === 0) return NextResponse.json({ ok: false, error: "Select at least one option." }, { status: 400 });
    const member = await getCurrentMembership();
    if (!member) return NextResponse.json({ ok: false, error: "No current user." }, { status: 400 });
    const { db } = getTenantDb();
    await votePoll(db, { pollId: params.pollId, userId: member.clerkUserId, optionIds });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
