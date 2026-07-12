/*
 * api.ts (Sprint 23) - shared plumbing for the Webmail API routes. resolveMail
 * runs requirePermission, resolves the current user, and loads the requested
 * EmailAccount only if the caller owns it (returns a 403/404 mapping otherwise).
 *
 * auditWrite is intentionally not called here: its AuditInput is typed to the
 * CRM entity kinds (LEAD/DEAL/CONTACT/COMPANY) and there is no EMAIL entity, so
 * mail routes follow the Sprint 21 Feed / Sprint 22 Workgroups precedent of
 * requirePermission-only auditing for module-specific entities.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse } from "next/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, getCurrentMembership, PermissionError } from "@/lib/rbac/require-permission";
import type { Action } from "@/lib/rbac/permissions";
import { getOwnedAccount } from "./queries";

export class MailAccessError extends Error {}
export class MailNotFoundError extends Error {}

export function failMail(err: unknown) {
  if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof MailAccessError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
  if (err instanceof MailNotFoundError) return NextResponse.json({ ok: false, error: err.message }, { status: 404 });
  if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
  return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
}

/** Authorize + resolve the account. Throws mapped errors on failure. */
export async function resolveMail(accountId: string, action: Action) {
  await requirePermission(action);
  const { db } = getTenantDb();
  const member = await getCurrentMembership();
  const userId = member?.clerkUserId ?? null;
  const account = await getOwnedAccount(db, accountId, userId);
  if (!account) throw new MailNotFoundError("Email account not found.");
  return { db, userId, account };
}
