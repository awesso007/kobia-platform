"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getAuthContext } from "@/lib/auth";
import { getActiveEntity } from "@/lib/active-entity";
import {
  sendAllMissingW9Requests,
  sendW9Request,
  type W9RequestResult,
} from "@/lib/tax/w9-requests";

const RESULT_COOKIE = "kobia_w9_result";

function storeResults(results: W9RequestResult[]): void {
  const sent = results.filter((r) => r.sent).length;
  const failed = results.filter((r) => !r.sent).length;
  const stubbed = results.some((r) => r.stubbed);
  cookies().set(
    RESULT_COOKIE,
    JSON.stringify({
      sent,
      failed,
      stubbed,
      total: results.length,
      ts: Date.now(),
    }),
    { path: "/", maxAge: 60, sameSite: "lax" },
  );
}

/**
 * Send W-9 requests to every 1099 vendor paid $600+ YTD with no Tax ID on file.
 */
export async function sendAllMissingW9RequestsAction(formData: FormData): Promise<void> {
  const tenantSlug = String(formData.get("tenantSlug") || "");
  const year = Number(formData.get("year") || new Date().getUTCFullYear());
  if (!tenantSlug) throw new Error("Missing tenantSlug");

  const auth = await getAuthContext(tenantSlug);
  if (!auth) throw new Error("Unauthorized");

  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug });
  if (!entity) throw new Error("No active entity");

  const results = await sendAllMissingW9Requests({
    tenantId: auth.tenant.id,
    entityId: entity.id,
    year,
  });

  storeResults(results);
  revalidatePath(`/${tenantSlug}/tax/1099`);
}

/**
 * Send a W-9 request to a single vendor.
 */
export async function sendW9RequestAction(formData: FormData): Promise<void> {
  const tenantSlug = String(formData.get("tenantSlug") || "");
  const vendorId = String(formData.get("vendorId") || "");
  if (!tenantSlug || !vendorId) throw new Error("Missing tenantSlug or vendorId");

  const auth = await getAuthContext(tenantSlug);
  if (!auth) throw new Error("Unauthorized");

  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug });
  if (!entity) throw new Error("No active entity");

  const result = await sendW9Request({
    vendorId,
    tenantId: auth.tenant.id,
    entityId: entity.id,
  });

  storeResults([result]);
  revalidatePath(`/${tenantSlug}/tax/1099`);
}
