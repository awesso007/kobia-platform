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
  // Sprint 1: CRM shell is a stub with no tenant resolution yet (see
  // CONFLICTS.md, Conflict 2). Kept public so the shell renders during the
  // foundations sprint. Auth gating is added once tenant resolution is wired.
  "/app(.*)",
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

  // Sprint 1 tenant resolution (slug-in-URL, see CONFLICTS.md Conflict 2).
  // We resolve the active tenant from the first path segment and attach
  // x-tenant-id (slug) + x-tenant-schema (tenant_<slug>) so getTenantDb() can
  // bind the per-tenant Prisma client. We deliberately do NOT do a DB lookup
  // here (Edge runtime has no Prisma); the schema name is derived from the
  // slug. Clerk Organizations are intentionally not wired this sprint.
  const tenantSlug = resolveTenantSlug(url.pathname);
  if (tenantSlug) {
    res.headers.set("x-tenant-id", tenantSlug);
    res.headers.set("x-tenant-schema", schemaNameForSlug(tenantSlug));
  }
  return res;
});

// Path segments that are NOT tenant slugs (platform-level or shared routes).
const NON_TENANT_SEGMENTS = new Set([
  "app",
  "api",
  "pricing",
  "signup",
  "pay",
  "bill-view",
  "portal",
  "sign",
  "debug2",
  "_next",
]);

/** First path segment, treated as a tenant slug unless it is a reserved route. */
function resolveTenantSlug(pathname: string): string | null {
  const seg = pathname.split("/").filter(Boolean)[0];
  if (!seg) return null;
  if (NON_TENANT_SEGMENTS.has(seg)) return null;
  return seg;
}

/** Map a tenant slug to its Postgres schema name (kept in sync with tenant-prisma.ts). */
function schemaNameForSlug(slug: string): string {
  return `tenant_${slug.replace(/-/g, "_")}`;
}

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)", "/(api|trpc)(.*)"],
};
