"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getAuthContext } from "@/lib/auth";
import { getActiveEntity } from "@/lib/active-entity";
import {
  sendAllOverdueInvoiceReminders,
  sendInvoiceReminder,
  type ReminderResult,
} from "@/lib/accounting/reminders";

const RESULT_COOKIE = "kobia_reminder_result";

function storeResults(results: ReminderResult[]): void {
  const sent = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
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
    {
      path: "/",
      maxAge: 60,
      sameSite: "lax",
    }
  );
}

/**
 * Send reminders for all overdue invoices for the active entity.
 */
export async function sendAllOverdueRemindersAction(
  formData: FormData
): Promise<void> {
  const tenantSlug = String(formData.get("tenantSlug") || "");
  if (!tenantSlug) throw new Error("Missing tenantSlug");

  const auth = await getAuthContext(tenantSlug);
  if (!auth) throw new Error("Unauthorized");

  const entity = await getActiveEntity({
    tenantId: auth.tenant.id,
    tenantSlug,
  });
  if (!entity) throw new Error("No active entity");

  const results = await sendAllOverdueInvoiceReminders({
    tenantId: auth.tenant.id,
    entityId: entity.id,
  });

  storeResults(results);
  revalidatePath(`/${tenantSlug}/books/reports/ar-aging`);
}

/**
 * Send a reminder for a single invoice.
 */
export async function sendInvoiceReminderAction(
  formData: FormData
): Promise<void> {
  const tenantSlug = String(formData.get("tenantSlug") || "");
  const invoiceId = String(formData.get("invoiceId") || "");
  if (!tenantSlug || !invoiceId)
    throw new Error("Missing tenantSlug or invoiceId");

  const auth = await getAuthContext(tenantSlug);
  if (!auth) throw new Error("Unauthorized");

  const entity = await getActiveEntity({
    tenantId: auth.tenant.id,
    tenantSlug,
  });
  if (!entity) throw new Error("No active entity");

  const result = await sendInvoiceReminder({
    tenantId: auth.tenant.id,
    entityId: entity.id,
    invoiceId,
  });

  storeResults([result]);
  revalidatePath(`/${tenantSlug}/ar/invoices/${invoiceId}`);
  revalidatePath(`/${tenantSlug}/books/reports/ar-aging`);
}
