/**
 * Next.js middleware — Clerk auth + tenant resolution.
 *
 * Lock EEEE: Per-tenant subdomain routing.
 *   {tenant}.kobia.ai → rewrites to /[tenant]/...
 *
 * In dev (localhost), we use path-based routing: /demo/login, /fig/dashboard
 */
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/pricing",
  "/signup(.*)",
  "/:tenant/login(.*)",
  "/api/trpc(.*)",
  "/api/webhooks(.*)",
  "/pay/(.*)",
  "/bill-view/(.*)",
  "/portal(.*)",
  "/sign/(.*)",
  "/debug2(.*)",
]);

export default clerkMiddleware((auth, req: NextRequest) => {
  const url = req.nextUrl;
  const hostname = req.headers.get("host") ?? "";
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "kobia.ai";

  // Subdomain routing in production
  if (hostname.endsWith(`.${rootDomain}`) && hostname !== rootDomain) {
    const subdomain = hostname.replace(`.${rootDomain}`, "");
    if (subdomain && subdomain !== "www") {
      url.pathname = `/${subdomain}${url.pathname}`;
      const res = NextResponse.rewrite(url);
      res.headers.set("x-pathname", url.pathname);
      return res;
    }
  }

  if (!isPublicRoute(req)) {
    const { userId } = auth();
    if (!userId) {
      // Redirect unauthed user to their tenant login page (or root if no tenant in path).
      // Avoids Clerk's default 404-via-not-found-rewrite when no signInUrl is configured.
      const segments = url.pathname.split("/").filter(Boolean);
      const maybeTenant = segments[0];
      const loginUrl = maybeTenant
        ? new URL(`/${maybeTenant}/login`, req.url)
        : new URL("/", req.url);
      loginUrl.searchParams.set("redirect_url", url.pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Expose pathname to RSC layouts (used by tenant layout for onboarding guard).
  const res = NextResponse.next();
  res.headers.set("x-pathname", url.pathname);
  return res;
});

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)", "/(api|trpc)(.*)"],
};
