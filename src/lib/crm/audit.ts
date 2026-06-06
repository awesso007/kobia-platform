/*
 * Audit log helper (Sprint 3). auditWrite() records a CRUD event to the
 * tenant-scoped AuditEntry table. CRM server actions call it after a successful
 * create/update/delete so the /app/settings/audit surface has a trail.
 *
 * Actor identity is best-effort: we read the Clerk user id from auth() and,
 * when available, the email from currentUser(). Neither is required (seed
 * scripts and unauthenticated dev contexts still write an entry with null
 * actor). Request ip/userAgent come from the incoming headers.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { headers } from "next/headers";
import { auth, currentUser } from "@clerk/nextjs/server";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import type { EntityType } from "@/lib/crm/record";

type AuditActionKind = "CREATE" | "UPDATE" | "DELETE" | "VIEW";

export type AuditInput = {
  action: AuditActionKind;
  entityType: EntityType;
  entityId: string;
  diff?: unknown;
};

/**
 * Write one audit entry. Never throws: auditing must not break the user-facing
 * action it wraps, so failures are swallowed (logged to the server console).
 */
export async function auditWrite(input: AuditInput): Promise<void> {
  try {
    const { db } = getTenantDb();

    let actorClerkUserId: string | null = null;
    let actorEmail: string | null = null;
    try {
      actorClerkUserId = auth().userId ?? null;
      if (actorClerkUserId) {
        const u = await currentUser();
        actorEmail =
          u?.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress ?? null;
      }
    } catch {
      // auth()/currentUser() throw outside a request scope (e.g. seed scripts).
    }

    let ip: string | null = null;
    let userAgent: string | null = null;
    try {
      const h = headers();
      ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
      userAgent = h.get("user-agent") || null;
    } catch {
      // headers() throws outside a request scope.
    }

    await db.auditEntry.create({
      data: {
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        diff: (input.diff ?? undefined) as never,
        actorClerkUserId,
        actorEmail,
        ip,
        userAgent,
      },
    });
  } catch (err) {
    console.error("[auditWrite] failed to record audit entry", err);
  }
}
