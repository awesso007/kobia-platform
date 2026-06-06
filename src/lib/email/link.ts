/*
 * link.ts (Sprint 6) - resolve an inbound/outbound email to the CRM records it
 * should attach to.
 *
 * Given a counterparty address (the external party on a message), we try to
 * find a matching Contact, then walk to that Contact's Company and any OPEN
 * Deals / Leads associated with it. The first match (in priority order
 * CONTACT -> DEAL -> COMPANY -> LEAD) becomes the thread's linked record so the
 * RecordPane Email tab can surface the thread.
 *
 * Used by both the send path (when a brand-new thread has no explicit record)
 * and the inbound webhook (which never has an explicit record).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import type { PrismaClient } from "@/lib/db/generated/tenant";

type Db = PrismaClient;

/** The four CRM records an email thread can be linked to. */
export type EmailRecordType = "LEAD" | "DEAL" | "CONTACT" | "COMPANY";

export type EmailLink = {
  recordType: EmailRecordType;
  recordId: string;
};

/**
 * Resolve a CRM record link from a counterparty email address.
 * Returns null when nothing matches (thread stays unlinked).
 */
export async function resolveLinkForAddress(db: Db, address: string): Promise<EmailLink | null> {
  const email = address.trim().toLowerCase();
  if (!email) return null;

  const contact = await db.contact.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    orderBy: { createdAt: "asc" },
  });

  if (contact) {
    // Prefer an open Deal on this contact, then the contact itself.
    const openDeal = await db.deal.findFirst({
      where: { contactId: contact.id, status: "OPEN" },
      orderBy: { updatedAt: "desc" },
    });
    if (openDeal) return { recordType: "DEAL", recordId: openDeal.id };

    if (contact.companyId) {
      const companyDeal = await db.deal.findFirst({
        where: { companyId: contact.companyId, status: "OPEN" },
        orderBy: { updatedAt: "desc" },
      });
      if (companyDeal) return { recordType: "DEAL", recordId: companyDeal.id };
    }

    return { recordType: "CONTACT", recordId: contact.id };
  }

  // No contact: fall back to an open Lead with this email.
  const lead = await db.lead.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, status: { not: "CONVERTED" } },
    orderBy: { updatedAt: "desc" },
  });
  if (lead) return { recordType: "LEAD", recordId: lead.id };

  return null;
}
