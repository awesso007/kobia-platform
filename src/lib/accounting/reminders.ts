/**
 * AR / AP aging email reminders.
 *
 * - sendInvoiceReminder: one invoice → its customer email.
 * - sendAllOverdueInvoiceReminders: batch over OPEN/PARTIAL past-due invoices for an entity.
 * - sendVendorBillReminder: internal reminder to the entity owner about overdue bills.
 */
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { formatCents } from "@/lib/accounting/ledger";

export interface ReminderResult {
  invoiceId: string;
  invoiceNumber: number;
  customerEmail: string | null;
  ok: boolean;
  error?: string;
  stubbed?: boolean;
  portalUrl?: string;
}

function portalBaseUrl(): string {
  // Prefer explicit app URL, then Vercel URL, then localhost.
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

function buildInvoiceEmailHtml(args: {
  entityName: string;
  customerName: string;
  invoiceNumber: number;
  totalCents: bigint;
  balanceCents: bigint;
  dueDate: Date;
  daysPastDue: number;
  portalUrl: string;
}): { subject: string; html: string; text: string } {
  const overdue = args.daysPastDue > 0;
  const headline = overdue
    ? `Invoice #${args.invoiceNumber} is ${args.daysPastDue} day${args.daysPastDue === 1 ? "" : "s"} past due`
    : `Reminder: Invoice #${args.invoiceNumber}`;
  const subject = overdue
    ? `${headline} — ${args.entityName}`
    : `Invoice #${args.invoiceNumber} from ${args.entityName}`;

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#0f172a;">
  <div style="font-size:12px;text-transform:uppercase;letter-spacing:1.5px;color:#64748b;">${args.entityName}</div>
  <h2 style="margin:8px 0 16px 0;color:#0f172a;">${headline}</h2>
  <p style="font-size:14px;line-height:1.6;color:#334155;">Hi ${args.customerName},</p>
  <p style="font-size:14px;line-height:1.6;color:#334155;">
    ${overdue
      ? `Just a friendly reminder that invoice <strong>#${args.invoiceNumber}</strong> was due on ${args.dueDate.toLocaleDateString()} and is now ${args.daysPastDue} day${args.daysPastDue === 1 ? "" : "s"} past due.`
      : `This is a reminder that invoice <strong>#${args.invoiceNumber}</strong> is due on ${args.dueDate.toLocaleDateString()}.`}
  </p>
  <table style="margin:16px 0;border-collapse:collapse;width:100%;">
    <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Invoice total</td><td style="padding:8px 0;text-align:right;font-family:monospace;">${formatCents(args.totalCents)}</td></tr>
    <tr><td style="padding:8px 0;color:#64748b;font-size:13px;font-weight:600;">Balance due</td><td style="padding:8px 0;text-align:right;font-family:monospace;font-weight:700;font-size:16px;">${formatCents(args.balanceCents)}</td></tr>
  </table>
  <div style="margin:24px 0;">
    <a href="${args.portalUrl}" style="display:inline-block;background:#2563eb;color:white;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;font-size:14px;">View invoice</a>
  </div>
  <p style="font-size:13px;line-height:1.6;color:#64748b;">If you've already sent payment, please disregard this notice. Reply to this email with any questions.</p>
  <p style="font-size:13px;line-height:1.6;color:#64748b;">Thanks,<br/>${args.entityName}</p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;"/>
  <div style="font-size:11px;color:#94a3b8;text-align:center;">Sent via KOBIA Accounting</div>
</div>
`.trim();

  const text = [
    headline,
    "",
    `Hi ${args.customerName},`,
    "",
    overdue
      ? `Invoice #${args.invoiceNumber} was due on ${args.dueDate.toLocaleDateString()} and is now ${args.daysPastDue} days past due.`
      : `Invoice #${args.invoiceNumber} is due on ${args.dueDate.toLocaleDateString()}.`,
    "",
    `Invoice total: ${formatCents(args.totalCents)}`,
    `Balance due: ${formatCents(args.balanceCents)}`,
    "",
    `View invoice: ${args.portalUrl}`,
    "",
    `Thanks, ${args.entityName}`,
  ].join("\n");

  return { subject, html, text };
}

/**
 * Send a reminder for a single invoice. Auto-generates a portal token if missing.
 * Returns success/failure for the caller to surface.
 */
export async function sendInvoiceReminder(args: {
  tenantId: string;
  entityId: string;
  invoiceId: string;
}): Promise<ReminderResult> {
  const invoice = await db.invoice.findFirst({
    where: {
      id: args.invoiceId,
      tenantId: args.tenantId,
      entityId: args.entityId,
    },
    include: {
      customer: { select: { name: true, email: true } },
      entity: { select: { name: true } },
    },
  });
  if (!invoice) {
    return {
      invoiceId: args.invoiceId,
      invoiceNumber: 0,
      customerEmail: null,
      ok: false,
      error: "Invoice not found",
    };
  }
  if (!invoice.customer.email) {
    return {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerEmail: null,
      ok: false,
      error: "Customer has no email on file",
    };
  }

  // Ensure a public token exists so the email link works.
  let token = invoice.publicViewToken;
  if (!token) {
    const { randomBytes } = await import("crypto");
    token = randomBytes(32).toString("hex");
    await db.invoice.update({
      where: { id: invoice.id },
      data: { publicViewToken: token },
    });
  }

  const portalUrl = `${portalBaseUrl()}/pay/${token}`;
  const now = new Date();
  const daysPastDue =
    invoice.dueDate < now
      ? Math.floor((now.getTime() - invoice.dueDate.getTime()) / 86_400_000)
      : 0;

  const { subject, html, text } = buildInvoiceEmailHtml({
    entityName: invoice.entity.name,
    customerName: invoice.customer.name,
    invoiceNumber: invoice.invoiceNumber,
    totalCents: invoice.totalCents,
    balanceCents: invoice.balanceCents,
    dueDate: invoice.dueDate,
    daysPastDue,
    portalUrl,
  });

  const result = await sendEmail({
    to: invoice.customer.email,
    subject,
    html,
    text,
  });

  return {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    customerEmail: invoice.customer.email,
    ok: result.ok,
    error: result.error,
    stubbed: result.stubbed,
    portalUrl,
  };
}

/**
 * Batch reminders: send to every OPEN/PARTIAL invoice past due for an entity.
 * Returns per-invoice results.
 */
export async function sendAllOverdueInvoiceReminders(args: {
  tenantId: string;
  entityId: string;
}): Promise<ReminderResult[]> {
  const now = new Date();
  const overdue = await db.invoice.findMany({
    where: {
      tenantId: args.tenantId,
      entityId: args.entityId,
      status: { in: ["OPEN", "PARTIAL"] },
      dueDate: { lt: now },
      balanceCents: { gt: 0n },
    },
    select: { id: true },
  });

  const results: ReminderResult[] = [];
  for (const inv of overdue) {
    const r = await sendInvoiceReminder({
      tenantId: args.tenantId,
      entityId: args.entityId,
      invoiceId: inv.id,
    });
    results.push(r);
  }
  return results;
}
