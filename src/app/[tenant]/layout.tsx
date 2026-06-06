import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTenantBySlug } from "@/lib/tenant";
import { ensureMembership } from "@/lib/ensure-membership";
import { ModuleSidebar } from "@/components/layout/ModuleSidebar";
import { TopBar } from "@/components/layout/TopBar";
import { RightRail } from "@/components/layout/RightRail";
import { PoweredByKobia } from "@/components/branding/PoweredByKobia";
import { TRPCProvider } from "@/components/providers/TRPCProvider";
import { getActiveEntity, listEntitiesForSwitcher } from "@/lib/active-entity";
import { getActiveModule, DEFAULT_MODULE, type ModuleKey } from "@/lib/active-module";
import { getModuleByKey, visibleModules } from "@/lib/modules-config";
import { accountingEnabled } from "@/lib/feature-flags";

// Path prefixes (after the tenant slug) that belong to the legacy accounting
// surface. When ENABLE_ACCOUNTING is off (v0.1 CRM alpha) these are hidden:
// the layout redirects them to the CRM shell rather than rendering accounting
// chrome. We do NOT delete or physically relocate the route files (see
// CONFLICTS.md) - the flag gates them so they can be turned back on.
const ACCOUNTING_PREFIXES = [
  "/dashboard",
  "/inbox",
  "/books",
  "/ar",
  "/ap",
  "/bank",
  "/items",
  "/payroll",
  "/practice",
  "/time",
  "/workflows",
  "/vault",
  "/communications",
  "/tax",
  "/tax-filings",
  "/invoicing",
  "/entities",
  "/diag",
];

function isAccountingPath(pathAfterTenant: string): boolean {
  const p = pathAfterTenant.startsWith("/") ? pathAfterTenant : `/${pathAfterTenant}`;
  return ACCOUNTING_PREFIXES.some((pre) => p === pre || p.startsWith(`${pre}/`));
}

/**
 * Defensive helpers — every external call below is wrapped so a single helper
 * failure cannot 500 the whole tenant shell. We log to console.error for
 * Vercel observability and return safe defaults.
 */
async function safeGetTenant(slug: string) {
  try {
    return await getTenantBySlug(slug);
  } catch (err) {
    console.error("[tenant-layout] getTenantBySlug failed", err);
    return null;
  }
}

async function safeEnsureMembership(slug: string) {
  try {
    await ensureMembership(slug);
  } catch (err) {
    console.error("[tenant-layout] ensureMembership failed", err);
  }
}

function safeHeaderPathname(): string {
  try {
    const h = headers();
    return h.get("x-pathname") || "";
  } catch (err) {
    console.error("[tenant-layout] headers() failed", err);
    return "";
  }
}

async function safeListEntities(tenantId: string) {
  try {
    return await listEntitiesForSwitcher(tenantId);
  } catch (err) {
    console.error("[tenant-layout] listEntitiesForSwitcher failed", err);
    return [];
  }
}

async function safeActiveEntity(opts: { tenantId: string; tenantSlug: string }) {
  try {
    return await getActiveEntity(opts);
  } catch (err) {
    console.error("[tenant-layout] getActiveEntity failed", err);
    return null;
  }
}

async function safeActiveModule(slug: string): Promise<ModuleKey> {
  try {
    return await getActiveModule(slug);
  } catch (err) {
    console.error("[tenant-layout] getActiveModule failed", err);
    return DEFAULT_MODULE;
  }
}

export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { tenant: string };
}) {
  const tenant = await safeGetTenant(params.tenant);
  if (!tenant) notFound();

  // Auto-heal: ensure the Clerk-authenticated user has a User+Membership.
  // Always best-effort; never blocks rendering.
  await safeEnsureMembership(tenant.slug);

  // Detect whether we're inside the /welcome flow or /login (Clerk renders own UI).
  const pathname = safeHeaderPathname();
  const isOnWelcome = pathname.includes(`/${tenant.slug}/welcome`);
  const isOnLogin = pathname.includes(`/${tenant.slug}/login`);

  // Feature flag gate: hide the legacy accounting surface in v0.1 (CRM alpha).
  // The route files still exist; we just refuse to render them and send the
  // user to the CRM shell. Flip ENABLE_ACCOUNTING=true to restore access.
  if (!accountingEnabled()) {
    const afterTenant = pathname.replace(new RegExp(`^/${tenant.slug}`), "");
    if (isAccountingPath(afterTenant)) {
      redirect("/app/deals");
    }
  }

  // Route guard: send new tenants through /welcome before they hit the app shell.
  if (!tenant.onboardingCompleted && !isOnWelcome && !isOnLogin) {
    redirect(`/${tenant.slug}/welcome`);
  }

  // Welcome flow and login both render full-screen — no sidebar/header chrome.
  if (isOnWelcome || isOnLogin) {
    return (
      <div
        style={
          {
            "--primary": tenant.primaryColor,
            "--secondary": tenant.secondaryColor,
          } as React.CSSProperties
        }
      >
        <TRPCProvider>{children}</TRPCProvider>
      </div>
    );
  }

  const [entities, activeEntity, activeModule] = await Promise.all([
    safeListEntities(tenant.id),
    safeActiveEntity({ tenantId: tenant.id, tenantSlug: tenant.slug }),
    safeActiveModule(tenant.slug),
  ]);

  const mod = getModuleByKey(activeModule);
  const topTabs = mod?.topTabs ?? [];

  return (
    <div
      className="flex h-screen bg-slate-50"
      style={
        {
          "--primary": tenant.primaryColor,
          "--secondary": tenant.secondaryColor,
        } as React.CSSProperties
      }
    >
      <TRPCProvider>
        {/* LEFT: Module sidebar (220px, dark, labeled) */}
        <ModuleSidebar
          tenantSlug={tenant.slug}
          activeModule={activeModule}
          modules={visibleModules({ accountingEnabled: accountingEnabled() })}
        />

        {/* CENTER: top bar + main canvas */}
        <div className="flex flex-1 min-w-0 flex-col">
          <TopBar
            tenant={tenant}
            entities={entities}
            activeEntityId={activeEntity?.id ?? null}
            tabs={topTabs}
          />
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
          <PoweredByKobia tenant={tenant} />
        </div>

        {/* RIGHT: slim quick-tools rail */}
        <RightRail />
      </TRPCProvider>
    </div>
  );
}
