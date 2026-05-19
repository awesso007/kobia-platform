"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { cookieKeyForTenant } from "@/lib/active-entity";

/**
 * Switch the active entity for the current tenant.
 * Verifies the user is authenticated for the tenant and that the entity
 * belongs to that tenant before setting the cookie.
 */
export async function switchEntityAction(formData: FormData) {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const entityId = String(formData.get("entityId") ?? "");
  if (!tenantSlug || !entityId) return { ok: false, error: "Missing fields" };

  const auth = await getAuthContext(tenantSlug);
  if (!auth) return { ok: false, error: "Not authenticated" };

  const entity = await db.entity.findFirst({
    where: { id: entityId, tenantId: auth.tenant.id, isActive: true },
  });
  if (!entity) return { ok: false, error: "Entity not found" };

  cookies().set(cookieKeyForTenant(tenantSlug), entityId, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });

  // Revalidate every tenant route so cached server pages re-render with new entity.
  revalidatePath(`/${tenantSlug}`, "layout");
  return { ok: true };
}
