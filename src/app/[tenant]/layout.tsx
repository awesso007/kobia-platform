import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTenantBySlug } from "@/lib/tenant";
import { ensureMembership } from "@/lib/ensure-membership";
import { ModuleSidebar } from "@/components/layout/ModuleSidebar";
import { TopBar } from "@/components/layout/TopBar";
import { PoweredByKobia } from "@/components/branding/PoweredByKobia";
import { TRPCProvider } from "@/components/providers/TRPCProvider";
import { getActiveEntity, listEntitiesForSwitcher } from "@/lib/active-entity";
import { getActiveModule, DEFAULT_MODULE, type ModuleKey } from "@/lib/active-module";
import { getModuleByKey } from "@/lib/modules-config";

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

  // Route guard: send new tenants through /welcome before they hit the app shell.
  if (!tenant.onboardingCompleted && !isOnWelcome && !isOnLogin) {
    redirect(`/${tenant.slug}/welcome`);
  }

  // Build theme style block from tenant brand colors.
  const primary = tenant.primaryColor || "#0F172A";
  const secondary = tenant.secondaryColor || "#3B82F6";
  const themeStyle = {
    "--kobia-primary": primary,
    "--kobia-secondary": secondary,
    "--kobia-primary-50": hexToTintBg(primary),
  } as React.CSSProperties;

  // Welcome flow and login both render full-screen — no sidebar/header chrome.
  if (isOnWelcome || isOnLogin) {
    return (
      <div style={themeStyle}>
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
    <div className="flex h-screen bg-slate-50" style={themeStyle}>
      <TRPCProvider>
        {/* LEFT: flat sidebar */}
        <ModuleSidebar tenantSlug={tenant.slug} activeModule={activeModule} />

        {/* CENTER: top bar + main canvas with gradient background */}
        <div className="flex flex-1 min-w-0 flex-col">
          <TopBar
            tenant={tenant}
            entities={entities}
            activeEntityId={activeEntity?.id ?? null}
            tabs={topTabs}
          />
          <main
            className="flex-1 overflow-y-auto p-6"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in srgb, var(--kobia-primary) 6%, white) 0%, color-mix(in srgb, var(--kobia-secondary) 8%, white) 100%)",
            }}
          >
            {children}
          </main>
          <PoweredByKobia tenant={tenant} />
        </div>
      </TRPCProvider>
    </div>
  );
}

/** Convert a hex color to a very light tint (used for active nav bg). */
function hexToTintBg(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return "#eff6ff";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  // 92% white + 8% color
  const tint = (c: number) => Math.round(255 * 0.92 + c * 0.08);
  return `rgb(${tint(r)}, ${tint(g)}, ${tint(b)})`;
}
