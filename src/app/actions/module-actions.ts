"use server";

import { revalidatePath } from "next/cache";
import { setActiveModule, type ModuleKey } from "@/lib/active-module";

export async function switchModule(tenantSlug: string, moduleKey: ModuleKey, redirectTo?: string) {
  await setActiveModule(tenantSlug, moduleKey);
  if (redirectTo) {
    revalidatePath(redirectTo);
  }
  revalidatePath(`/${tenantSlug}`, "layout");
}
