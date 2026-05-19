"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth";
import { getActiveEntity } from "@/lib/active-entity";
import { db } from "@/lib/db";
import { sendStatementEmail } from "@/lib/email/statement-email";

const RESULT_COOKIE = "kobia_statement_email_result";

function storeResults(
  sent: number,
  skipped: number,
  failed: number,
  stubbed: boolean,
): void {
  cookies().set(
    RESULT_COOKIE,
    JSON.stringify({ sent, skipped, failed, stubbed, ts: Date.now() }),
    { path: "/", maxAge: 60, sameSite: "lax" },
  );
}

export async function emailSingleStatementAction(formData: FormData): Promise<void> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const customerId = String(formData.get("customerId") ?? "");

  if (!tenantSlug || !customerId) throw new Error("Missing params.");

  const auth = await getAuthContext(tenantSlug);
  if (!auth) throw new Error("Unauthorized");

  const entity = await getActiveEntity({
    tenantId: auth.tenant.id,
    tenantSlug,
  });
  if (!entity) throw new Error("No active entity");

  const result = await sendStatementEmail({
    tenantId: auth.tenant.id,
    tenantSlug,
    entityId: entity.id,
    customerId,
  });

  storeResults(
    result.sent ? 1 : 0,
    result.error?.includes("Zero balance") || result.error?.includes("No email") ? 1 : 0,
    !result.sent && !result.error?.includes("Zero balance") && !result.error?.includes("No email")
      ? 1
      : 0,
    result.stubbed,
  );

  revalidatePath(`/${tenantSlug}/ar/statements`);
}

export async function emailAllStatementsAction(formData: FormData): Promise<void> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");

  if (!tenantSlug) throw new Error("Missing tenantSlug.");

  const auth = await getAuthContext(tenantSlug);
  if (!auth) throw new Error("Unauthorized");

  const entity = await getActiveEntity({
    tenantId: auth.tenant.id,
    tenantSlug,
  });
  if (!entity) throw new Error("No active entity");

  // Fetch every customer with an open balance.
  const customers = await db.customer.findMany({
    where: {
      tenantId: auth.tenant.id,
      entityId: entity.id,
      isActive: true,
      invoices: {
        some: {
          status: { in: ["OPEN", "PARTIAL"] },
          balanceCents: { gt: 0 },
        },
      },
    },
    select: { id: true },
  });

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let stubbed = false;

  for (const c of customers) {
    const r = await sendStatementEmail({
      tenantId: auth.tenant.id,
      tenantSlug,
      entityId: entity.id,
      customerId: c.id,
    });
    if (r.sent) sent++;
    else if (
      r.error?.includes("Zero balance") ||
      r.error?.includes("No email")
    ) {
      skipped++;
    } else failed++;
    if (r.stubbed) stubbed = true;
  }

  storeResults(sent, skipped, failed, stubbed);
  revalidatePath(`/${tenantSlug}/ar/statements`);
}
