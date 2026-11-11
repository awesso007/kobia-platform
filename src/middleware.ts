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
  "/api/chess/document-scan",
  "/api/chess/scan-worker",
  "/api/chess/recurrences/run",
  "/api/chess/calendar-sync/run",
  "/api/chess/payroll-status/run",
  "/api/chess/ai-triage/run",
  "/api/chess/audit-archive/run",
  "/api/webhooks(.*)",
  // Public web-to-lead forms (Sprint 5): the hosted form page and its submit
  // endpoint are intentionally unauthenticated. Tenant is resolved from a
  // validated `?t=<slug>` query param, not from the session.
  "/forms(.*)",
  "/api/forms(.*)",
  // Public quote view (Sprint 10): slug-gated, unauthenticated. Tenant resolved
  // from a validated `?t=<slug>` query param, not from the session.
  "/quote(.*)",
  // Public booking pages (Sprint 12): the /book/[slug] scheduling surface, its
  // reschedule/cancel routes, and the booking submit endpoint are intentionally
  // unauthenticated. Tenant is resolved from a validated `?t=<slug>` query.
  "/book(.*)",
  "/api/book(.*)",
  "/pay/(.*)",
  "/bill-view/(.*)",
  "/portal(.*)",
  "/sign/(.*)",
  "/debug2(.*)",
  // Public marketing surfaces (Sprint 13): the hosted landing page, open/click
  // tracking endpoints, and the unsubscribe page + submit endpoint are
  // intentionally unauthenticated. Tenant is resolved from a validated
  // `?t=<slug>` query param (landing page also accepts the kb-tenant cookie).
  "/p(.*)",
  "/api/track(.*)",
  "/api/unsubscribe(.*)",
  "/unsubscribe(.*)",
  // Public Documents surfaces (Sprint 14): the e-signature signing page
  // (/esign/[token]) and its submit endpoint, plus the document share viewer
  // (/d/[token]). Tenant is resolved from a validated `?t=<slug>` query param.
  "/esign(.*)",
  "/api/esign(.*)",
  "/d/(.*)",
  // Public Helpdesk surfaces (Sprint 15): the customer portal (/portal, already
  // listed above), the public knowledge base (/kb, /kb/[slug]), the portal login
  // + ticket APIs, and the KB feedback API are intentionally unauthenticated.
  // Tenant is resolved from a validated `?t=<slug>` query param; the portal also
  // gates ticket reads/writes by a signed customer-session cookie.
  "/kb(.*)",
  "/api/portal(.*)",
  "/api/kb(.*)",
]);

export default clerkMiddleware((auth, req: NextRequest) => {
  const url = req.nextUrl.clone();
  const host = (req.headers.get("host") ?? "").split(":")[0] ?? "";
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "kobia.ai";
  const rawSubdomain = host.endsWith(`.${rootDomain}`)
    ? host.slice(0, -(`.${rootDomain}`).length) : null;
  const hostTenant = rawSubdomain && rawSubdomain !== "www" ? sanitizeSlug(rawSubdomain) : null;
  const isApi = url.pathname === "/api" || url.pathname.startsWith("/api/");
  const rewrite = !!hostTenant && !isApi;

  if (rewrite && hostTenant) {
    url.pathname = `/${hostTenant}${url.pathname}`;
  }

  if (!isPublicRoute(req)) {
    const { userId } = auth();
    if (!userId) {
      const segments = url.pathname.split("/").filter(Boolean);
      const maybeTenant = hostTenant ?? (segments[0] && !NON_TENANT_SEGMENTS.has(segments[0]) ? segments[0] : null);
      const loginUrl = maybeTenant ? new URL(`/${maybeTenant}/login`, req.url) : new URL("/", req.url);
      loginUrl.searchParams.set("redirect_url", req.nextUrl.pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Never trust incoming x-tenant-* headers. Only request headers passed to
  // NextResponse.next/rewrite are visible to server components and route handlers.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.delete("x-tenant-id");
  requestHeaders.delete("x-tenant-schema");

  const isChessApi = url.pathname.startsWith("/api/chess/") ||
    url.pathname.startsWith("/api/client-profiles") ||
    url.pathname.startsWith("/api/client-service-links");
  const isCrmApp = url.pathname === "/app" || url.pathname.startsWith("/app/");
  const isTenantRoute = !!resolveTenantSlug(url.pathname);
  let tenantSlug = hostTenant ?? (isTenantRoute ? resolveTenantSlug(url.pathname) : null);
  if (url.pathname === "/api/chess/document-scan" || url.pathname === "/api/chess/scan-worker" ||
      url.pathname === "/api/chess/recurrences/run" ||
      url.pathname === "/api/chess/calendar-sync/run" ||
      url.pathname === "/api/chess/payroll-status/run" ||
      url.pathname === "/api/chess/ai-triage/run") {
    tenantSlug = sanitizeSlug(url.searchParams.get("t"));
  }

  if (!tenantSlug && (isCrmApp || isChessApi)) {
    const fromCookie = sanitizeSlug(req.cookies.get("kb-tenant")?.value);
    const fromQuery = isCrmApp ? sanitizeSlug(url.searchParams.get("tenant")) : null;
    const defaultTenant = sanitizeSlug(process.env.NEXT_PUBLIC_DEFAULT_TENANT);
    tenantSlug = fromQuery ?? fromCookie ?? defaultTenant;
  }

  if (tenantSlug) {
    requestHeaders.set("x-tenant-id", tenantSlug);
    requestHeaders.set("x-tenant-schema", schemaNameForSlug(tenantSlug));
  }

  const options = { request: { headers: requestHeaders } };
  const response = rewrite ? NextResponse.rewrite(url, options) : NextResponse.next(options);
  response.headers.set("x-pathname", url.pathname);
  if (isCrmApp && tenantSlug && url.searchParams.get("tenant") === tenantSlug) {
    response.cookies.set("kb-tenant", tenantSlug, { path: "/", sameSite: "lax", secure: process.env.NODE_ENV==="production", httpOnly: true });
  }
  return response;
});

/** Accept only Postgres-schema-safe slugs; reject anything else. */
function sanitizeSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(slug) ? slug : null;
}

// Path segments that are NOT tenant slugs (platform-level or shared routes).
const NON_TENANT_SEGMENTS = new Set([
  "app",
  "api",
  "forms",
  "quote",
  "book",
  "onboarding",
  "pricing",
  "signup",
  "pay",
  "bill-view",
  "portal",
  "sign",
  "debug2",
  "p",
  "track",
  "unsubscribe",
  "esign",
  "d",
  "kb",
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
