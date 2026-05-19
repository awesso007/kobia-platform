import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

const PORTAL_COOKIE = "kobia_portal_session";
const SESSION_TTL_DAYS = 30;

export async function GET(
  _req: Request,
  { params }: { params: { token: string } }
) {
  const token = params.token;
  const session = await db.portalSession.findUnique({
    where: { token },
    include: { portalUser: true },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  if (!session) {
    return NextResponse.redirect(
      new URL(`/portal/login?error=invalid`, baseUrl || "http://localhost:3000")
    );
  }
  if (session.expiresAt < new Date()) {
    return NextResponse.redirect(
      new URL(`/portal/login?error=expired`, baseUrl || "http://localhost:3000")
    );
  }
  if (!session.portalUser.isActive) {
    return NextResponse.redirect(
      new URL(
        `/portal/login?error=deactivated`,
        baseUrl || "http://localhost:3000"
      )
    );
  }

  // Mark consumed on first use; allow reuse if within TTL for convenience
  if (!session.consumedAt) {
    await db.portalSession.update({
      where: { id: session.id },
      data: { consumedAt: new Date() },
    });
  }
  await db.clientPortalUser.update({
    where: { id: session.portalUserId },
    data: { lastLoginAt: new Date() },
  });

  cookies().set(PORTAL_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    maxAge: 60 * 60 * 24 * SESSION_TTL_DAYS,
    path: "/portal",
  });

  return NextResponse.redirect(
    new URL(`/portal`, baseUrl || "http://localhost:3000")
  );
}
