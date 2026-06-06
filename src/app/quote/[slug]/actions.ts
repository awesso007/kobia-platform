"use server";

/*
 * Public quote actions (Sprint 10). These power the slug-gated public view at
 * /quote/[slug]?t=<tenant>. They DO NOT call requirePermission - access is
 * gated by the unguessable publicSlug only. The tenant is resolved from the
 * validated `t` slug (same pattern as the public web-to-lead form), so we bind
 * the per-tenant Prisma client directly with getTenantPrisma.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { revalidatePath } from "next/cache";
import { getTenantPrisma, schemaNameForSlug } from "@/lib/db/tenant-prisma";
import { auditWrite } from "@/lib/crm/audit";
import { dispatchAutomation } from "@/lib/automations/dispatch";
import { notifyOn } from "@/lib/notifications/notify";

function sanitizeSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(slug) ? slug : null;
}

function tenantDb(tenantSlug: string) {
  const safe = sanitizeSlug(tenantSlug);
  if (!safe) throw new Error("Unknown tenant.");
  return getTenantPrisma(schemaNameForSlug(safe));
}

/** Mark a quote VIEWED on first public render (sets viewedAt + bumps status from SENT). */
export async function markQuoteViewed(tenantSlug: string, slug: string): Promise<void> {
  const db = tenantDb(tenantSlug);
  const quote = await db.quote.findUnique({ where: { publicSlug: slug } });
  if (!quote || quote.viewedAt) return;
  await db.quote.update({
    where: { id: quote.id },
    data: { viewedAt: new Date(), status: quote.status === "SENT" ? "VIEWED" : quote.status },
  });
}

export async function acceptQuote(tenantSlug: string, slug: string): Promise<void> {
  const db = tenantDb(tenantSlug);
  const quote = await db.quote.findUnique({ where: { publicSlug: slug } });
  if (!quote) throw new Error("Quote not found.");
  if (quote.status === "ACCEPTED") return;
  await db.quote.update({ where: { id: quote.id }, data: { status: "ACCEPTED", acceptedAt: new Date() } });

  await db.crmActivity.create({
    data: {
      type: "NOTE",
      subject: `Quote ${quote.number} accepted`,
      body: `The customer accepted quote ${quote.number} from the public link.`,
      dealId: quote.dealId,
    },
  });

  if (quote.ownerClerkUserId) {
    await notifyOn(db, quote.ownerClerkUserId, { type: "SYSTEM", title: `Quote ${quote.number} accepted`, linkUrl: `/app/quotes/${quote.id}` });
  }
  await auditWrite({ action: "UPDATE", entityType: "COMPANY", entityId: quote.id, diff: { kind: "Quote", status: "ACCEPTED" } }, db);
  await dispatchAutomation({ type: "QUOTE_ACCEPTED", entityType: quote.dealId ? "DEAL" : "COMPANY", entityId: quote.dealId ?? quote.id, changedFields: ["status"] }, db);
  revalidatePath(`/quote/${slug}`);
}

export async function requestQuoteChanges(tenantSlug: string, slug: string, message: string): Promise<void> {
  const db = tenantDb(tenantSlug);
  const quote = await db.quote.findUnique({ where: { publicSlug: slug } });
  if (!quote) throw new Error("Quote not found.");
  const note = message.trim().slice(0, 2000) || "(no message)";
  await db.crmActivity.create({
    data: {
      type: "NOTE",
      subject: `Change request on quote ${quote.number}`,
      body: note,
      dealId: quote.dealId,
    },
  });
  if (quote.ownerClerkUserId) {
    await notifyOn(db, quote.ownerClerkUserId, { type: "SYSTEM", title: `Changes requested on quote ${quote.number}`, body: note, linkUrl: `/app/quotes/${quote.id}` });
  }
  await auditWrite({ action: "UPDATE", entityType: "COMPANY", entityId: quote.id, diff: { kind: "Quote", changeRequest: true } }, db);
  revalidatePath(`/quote/${slug}`);
}
