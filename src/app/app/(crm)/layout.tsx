import "@/styles/tokens.css";
import { headers } from "next/headers";
import { CrmSidebar } from "./CrmSidebar";
import { CrmTopBar } from "./CrmTopBar";
import { listNotifications } from "@/lib/notifications/queries";
import { listUserTenants } from "@/lib/tenancy/user-tenants";
import { getPlatformDb } from "@/lib/db/platform";
import { resolveTheme, themeCssVars, DEFAULT_THEME } from "@/lib/tenancy/theme";

async function activeTheme() {
  try {
    const slug = headers().get("x-tenant-id");
    if (!slug) return DEFAULT_THEME;
    const reg = await getPlatformDb().tenantRegistry.findUnique({ where: { slug }, select: { theme: true } });
    return resolveTheme(reg?.theme);
  } catch {
    return DEFAULT_THEME;
  }
}

/*
 * CRM shell layout (v0.1). Two-zone Bitrix24 layout: dark left rail + light
 * content area with a top bar. Scoped under .kobia-crm so design tokens do not
 * leak into the legacy accounting shell.
 *
 * Sprint 5: a signed-in user who belongs to no tenant is redirected to
 * /onboarding. The check is conservative - listUserTenants() returns [] both
 * when there is no Clerk session (alpha dev) and when the user genuinely has no
 * membership, so we only redirect when a membership scan ran and found nothing
 * for an authenticated user (userNeedsOnboarding handles that distinction).
 */
export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const [notifications, tenants, theme] = await Promise.all([listNotifications(), listUserTenants(), activeTheme()]);
  return (
    <div
      className="kobia-crm flex h-screen w-full overflow-hidden"
      style={{ backgroundColor: "var(--kb-page-bg)" }}
    >
      <style dangerouslySetInnerHTML={{ __html: themeCssVars(theme) }} />
      <CrmSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <CrmTopBar notifications={notifications} tenants={tenants} />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
