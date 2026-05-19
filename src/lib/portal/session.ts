import "server-only";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

export const PORTAL_COOKIE = "kobia_portal_session";

export async function getPortalSession() {
  const token = cookies().get(PORTAL_COOKIE)?.value;
  if (!token) return null;
  const session = await db.portalSession.findUnique({
    where: { token },
    include: {
      portalUser: {
        include: {
          // We'll join via entityId manually to keep this typed
        },
      },
    },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) return null;
  if (!session.portalUser.isActive) return null;
  return session;
}

export async function requirePortalSession() {
  const s = await getPortalSession();
  if (!s) return null;
  return s;
}
