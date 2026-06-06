/*
 * link.ts (Sprint 7) - resolve a phone number (E.164) to the CRM records it
 * should attach to. Mirrors the email link resolver: match a Contact by phone,
 * then its Company / open Deals; fall back to an open Lead.
 *
 * Used by the SMS inbound webhook and the call activity writer.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import type { PrismaClient } from "@/lib/db/generated/tenant";

type Db = PrismaClient;

export type PhoneLink = {
  contactId: string | null;
  leadId: string | null;
  dealId: string | null;
  companyId: string | null;
};

const EMPTY: PhoneLink = { contactId: null, leadId: null, dealId: null, companyId: null };

/** Normalize loosely-formatted phone input to bare digits for comparison. */
export function digitsOf(phone: string): string {
  return (phone || "").replace(/[^0-9]/g, "");
}

/**
 * Resolve CRM record links from a counterparty phone number. Matches by the
 * trailing 10 digits to tolerate +1 / formatting differences. Returns an
 * all-null link when nothing matches.
 */
export async function resolveLinkForPhone(db: Db, e164: string): Promise<PhoneLink> {
  const digits = digitsOf(e164);
  if (!digits) return { ...EMPTY };
  const last10 = digits.slice(-10);
  if (!last10) return { ...EMPTY };

  const contact = await db.contact.findFirst({
    where: { phone: { contains: last10 } },
    orderBy: { createdAt: "asc" },
  });
  if (contact) {
    const deal = await db.deal.findFirst({
      where: { contactId: contact.id, status: { not: "WON" } },
      orderBy: { createdAt: "desc" },
    }).catch(() => null);
    return {
      contactId: contact.id,
      companyId: contact.companyId ?? null,
      dealId: deal?.id ?? null,
      leadId: null,
    };
  }

  const lead = await db.lead.findFirst({
    where: { phone: { contains: last10 } },
    orderBy: { createdAt: "asc" },
  }).catch(() => null);
  if (lead) return { contactId: null, companyId: null, dealId: null, leadId: lead.id };

  return { ...EMPTY };
}
