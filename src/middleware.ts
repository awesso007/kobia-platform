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
  "/signup(.*)",
  "/:tenant/login(.*)",
  "/api/trpc(.*)",
  "/api/webhooks(.*)",
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
      return NextResponse.rewrite(url);
    }
  }

  if (!isPublicRoute(req)) {
    auth().protect();
  }
});

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)", "/(api|trpc)(.*)"],
};
