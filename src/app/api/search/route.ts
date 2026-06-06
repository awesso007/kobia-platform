/*
 * POST /api/search (Sprint 9). Server-rendered search for the Cmd+K palette.
 * The palette is a client component but it never touches Postgres - it posts the
 * query string here and renders the JSON groups. Ranked full-text via
 * websearch_to_tsquery + ts_rank_cd against SearchIndex.tsv (see lib/search).
 *
 * Also returns a static "Jump to..." list of route shortcuts filtered by the
 * query so the palette can offer navigation even with no record hits.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError } from "@/lib/rbac/require-permission";
import { search } from "@/lib/search/query";

export const dynamic = "force-dynamic";

type Body = { q?: string };

const JUMP_TO: Array<{ label: string; href: string }> = [
  { label: "Leads", href: "/app/leads" },
  { label: "Deals", href: "/app/deals" },
  { label: "Contacts", href: "/app/contacts" },
  { label: "Companies", href: "/app/companies" },
  { label: "Activities", href: "/app/activities" },
  { label: "Files", href: "/app/files" },
  { label: "Reports", href: "/app/reports" },
  { label: "Settings", href: "/app/settings" },
];

export async function POST(req: NextRequest) {
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    // empty body -> empty query
  }
  const q = (body.q ?? "").trim();

  try {
    await requirePermission("record:read");
    const { db } = getTenantDb();

    const groups = q ? await search(db, q) : [];

    const needle = q.toLowerCase();
    const jumpTo = needle
      ? JUMP_TO.filter((j) => j.label.toLowerCase().includes(needle))
      : JUMP_TO;

    return NextResponse.json({ ok: true, q, groups, jumpTo });
  } catch (err) {
    if (err instanceof NoTenantError) {
      return NextResponse.json({ ok: false, error: "No active tenant." }, { status: 403 });
    }
    if (err instanceof PermissionError) {
      return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
    }
    console.error("[search] route failed", err);
    return NextResponse.json({ ok: false, error: "Search failed." }, { status: 500 });
  }
}
