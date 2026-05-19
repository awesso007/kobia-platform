import { cookies } from "next/headers";

export const ACTIVE_MODULE_COOKIE_PREFIX = "kobia_active_module_";

export type ModuleKey = "accounting" | "mortgage" | "realestate";

export const DEFAULT_MODULE: ModuleKey = "accounting";

export async function getActiveModule(tenantSlug: string): Promise<ModuleKey> {
  const cookieStore = cookies();
  const c = cookieStore.get(`${ACTIVE_MODULE_COOKIE_PREFIX}${tenantSlug}`);
  const value = c?.value as ModuleKey | undefined;
  if (value === "accounting" || value === "mortgage" || value === "realestate") {
    return value;
  }
  return DEFAULT_MODULE;
}

export async function setActiveModule(tenantSlug: string, moduleKey: ModuleKey) {
  const cookieStore = cookies();
  cookieStore.set(`${ACTIVE_MODULE_COOKIE_PREFIX}${tenantSlug}`, moduleKey, {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
}
