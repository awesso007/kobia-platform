/*
 * Customer portal sessions (Sprint 15). The public customer portal authenticates
 * a contact by email and issues an opaque bearer token stored in
 * CustomerPortalSession. The token is sent back to the browser as a cookie by
 * the portal API routes; portal pages validate it on every request. Sessions
 * expire after `ttlMs` (default 14 days) and are pruned by a daily cron.
 *
 * This is a lightweight email-based gate, not a password login: anyone who knows
 * a contact's email can open a portal session for it. That matches the alpha
 * scope (the portal only exposes that contact's own tickets). A magic-link email
 * step can be layered on later without changing this surface.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import type { PrismaClient } from "@/lib/db/generated/tenant";
import { randomSlug } from "@/lib/files/files";

type Db = PrismaClient;

const DEFAULT_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export const PORTAL_COOKIE = "kobia_portal";

/**
 * Open a portal session for an email. A matching Contact is required (the portal
 * only exposes that contact's own tickets), so this returns null when no contact
 * has that email. Otherwise it issues an opaque token and returns it.
 */
export async function openPortalSession(
  db: Db,
  email: string,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<{ token: string; contactId: string } | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const contact = await db.contact.findFirst({ where: { email: { equals: normalized, mode: "insensitive" } } });
  if (!contact) return null;

  const token = randomSlug(32);
  await db.customerPortalSession.create({
    data: {
      contactId: contact.id,
      email: normalized,
      token,
      expiresAt: new Date(Date.now() + ttlMs),
    },
  });
  return { token, contactId: contact.id };
}

export type PortalSession = { contactId: string; email: string };

/** Validate a portal token, bumping lastUsedAt. Returns the session or null. */
export async function validatePortalSession(db: Db, token: string | null | undefined): Promise<PortalSession | null> {
  if (!token) return null;
  const session = await db.customerPortalSession.findUnique({ where: { token } });
  if (!session) return null;
  if (session.expiresAt < new Date()) return null;
  await db.customerPortalSession.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } });
  return { contactId: session.contactId, email: session.email };
}

/** Delete a single session by token (logout). */
export async function closePortalSession(db: Db, token: string): Promise<void> {
  await db.customerPortalSession.deleteMany({ where: { token } });
}

/** Delete all expired sessions. Returns how many were removed. Cron-safe. */
export async function pruneExpiredSessions(db: Db): Promise<number> {
  const res = await db.customerPortalSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return res.count;
}
