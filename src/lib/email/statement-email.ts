/// Statement email composition + bulk send.

import { db } from "@/lib/db";
import { sendEmail, type SendEmailResult } from "@/lib/email";
import { formatCents } from "@/lib/accounting/ledger";
import { getOpenItemStatement } from "@/lib/accounting/customer-statements";

export type StatementSendResult = {
  customerId: string;
  customerName: string;
  email: string | null;
  balanceCents: bigint;
  sent: boolean;
  stubbed: boolean;
  error?: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderStatementHtml(args: {
  tenantName: string;
  entityName: string;
  logoUrl: string | null;
  primaryColor: string | null;
  customerName: string;
  asOf: Date;
  totalDueCents: bigint;
  openInvoices: Array<{
    invoiceNumber: number | null;
    issueDate: Date;
    dueDate: Date;
    totalCents: bigint;
    paidCents: bigint;
    balanceCents: bigint;
  }>;
  portalUrls: Map<number, string>; // invoiceNumber → portal url
}): string {
  const color = args.primaryColor || "#1e40af";
  const rows = args.openInvoices
    .map((inv) => {
      const numLabel = inv.invoiceNumber != null ? `INV-${String(inv.invoiceNumber).padStart(4, "0")}` : "(draft)";
      const portal = inv.invoiceNumber != null ? args.portalUrls.get(inv.invoiceNumber) : undefined;
      const numLink = portal
        ? `<a href="${portal}" style="color:${color};text-decoration:none;">${numLabel}</a>`
        : numLabel;
      return `<tr>
        <td style="padding:6px 8px;border-top:1px solid #e2e8f0;">${numLink}</td>
        <td style="padding:6px 8px;border-top:1px solid #e2e8f0;color:#475569;">${new Date(inv.issueDate).toLocaleDateString()}</td>
        <td style="padding:6px 8px;border-top:1px solid #e2e8f0;color:#475569;">${new Date(inv.dueDate).toLocaleDateString()}</td>
        <td style="padding:6px 8px;border-top:1px solid #e2e8f0;text-align:right;color:#475569;">${formatCents(inv.totalCents)}</td>
        <td style="padding:6px 8px;border-top:1px solid #e2e8f0;text-align:right;color:#059669;">${formatCents(inv.paidCents)}</td>
        <td style="padding:6px 8px;border-top:1px solid #e2e8f0;text-align:right;font-weight:600;">${formatCents(inv.balanceCents)}</td>
      </tr>`;
    })
    .join("");

  const logo = args.logoUrl
    ? `<img src="${args.logoUrl}" alt="${escapeHtml(args.entityName)}" style="max-height:48px;max-width:200px;" />`
    : `<div style="font-size:20px;font-weight:700;color:${color};">${escapeHtml(args.entityName)}</div>`;

  return `<!doctype html>
<html><body style="margin:0;background:#f8fafc;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;">
  <div style="max-width:640px;margin:0 auto;padding:24px;">
    <div style="background:white;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
      <div style="padding:24px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
        ${logo}
        <h1 style="margin:16px 0 4px;font-size:20px;color:#0f172a;">Statement of Account</h1>
        <p style="margin:0;color:#64748b;font-size:14px;">As of ${args.asOf.toLocaleDateString()}</p>
      </div>
      <div style="padding:24px;">
        <p style="margin:0 0 8px;font-size:14px;">Hello ${escapeHtml(args.customerName)},</p>
        <p style="margin:0 0 16px;font-size:14px;color:#475569;">
          Here is a summary of your open invoices with ${escapeHtml(args.entityName)}.
        </p>

        <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:6px;padding:12px 16px;margin-bottom:20px;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#92400e;font-weight:600;">Total amount due</div>
          <div style="font-size:24px;font-weight:700;color:#92400e;margin-top:4px;">${formatCents(args.totalDueCents)}</div>
        </div>

        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:#f1f5f9;text-align:left;">
              <th style="padding:8px;font-size:11px;text-transform:uppercase;color:#64748b;">Invoice</th>
              <th style="padding:8px;font-size:11px;text-transform:uppercase;color:#64748b;">Date</th>
              <th style="padding:8px;font-size:11px;text-transform:uppercase;color:#64748b;">Due</th>
              <th style="padding:8px;font-size:11px;text-transform:uppercase;color:#64748b;text-align:right;">Amount</th>
              <th style="padding:8px;font-size:11px;text-transform:uppercase;color:#64748b;text-align:right;">Paid</th>
              <th style="padding:8px;font-size:11px;text-transform:uppercase;color:#64748b;text-align:right;">Balance</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        <p style="margin:24px 0 0;font-size:13px;color:#64748b;">
          Click any invoice number above to view and pay online. Questions? Reply to this email.
        </p>
      </div>
      <div style="padding:12px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;font-size:11px;color:#94a3b8;">
        ${escapeHtml(args.entityName)} · Powered by ${escapeHtml(args.tenantName)}
      </div>
    </div>
  </div>
</body></html>`;
}

export async function sendStatementEmail(args: {
  tenantId: string;
  tenantSlug: string;
  entityId: string;
  customerId: string;
}): Promise<StatementSendResult> {
  const tenant = await db.tenant.findUnique({
    where: { id: args.tenantId },
    select: { name: true, logoUrl: true, primaryColor: true },
  });
  const entity = await db.entity.findUnique({
    where: { id: args.entityId },
    select: { name: true },
  });
  const customer = await db.customer.findFirst({
    where: { id: args.customerId, tenantId: args.tenantId, entityId: args.entityId },
    select: { id: true, name: true, email: true },
  });

  if (!tenant || !entity || !customer) {
    return {
      customerId: args.customerId,
      customerName: customer?.name ?? "(unknown)",
      email: null,
      balanceCents: 0n,
      sent: false,
      stubbed: false,
      error: "Customer or entity not found.",
    };
  }

  if (!customer.email) {
    return {
      customerId: customer.id,
      customerName: customer.name,
      email: null,
      balanceCents: 0n,
      sent: false,
      stubbed: false,
      error: "No email on file.",
    };
  }

  const asOf = new Date();
  const statement = await getOpenItemStatement({
    tenantId: args.tenantId,
    entityId: args.entityId,
    customerId: customer.id,
    asOf,
  });

  if (statement.totalOutstandingCents === 0n) {
    return {
      customerId: customer.id,
      customerName: customer.name,
      email: customer.email,
      balanceCents: 0n,
      sent: false,
      stubbed: false,
      error: "Zero balance — skipped.",
    };
  }

  // Map invoice number → portal URL for any invoice with publicViewToken set
  const invoices = await db.invoice.findMany({
    where: {
      tenantId: args.tenantId,
      entityId: args.entityId,
      customerId: customer.id,
      status: { in: ["OPEN", "PARTIAL"] },
    },
    select: { invoiceNumber: true, publicViewToken: true },
  });
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://kobia-platform.vercel.app";
  const portalUrls = new Map<number, string>();
  for (const inv of invoices) {
    if (inv.publicViewToken) {
      portalUrls.set(inv.invoiceNumber, `${baseUrl}/pay/${inv.publicViewToken}`);
    }
  }

  const html = renderStatementHtml({
    tenantName: tenant.name,
    entityName: entity.name,
    logoUrl: tenant.logoUrl,
    primaryColor: tenant.primaryColor,
    customerName: customer.name,
    asOf,
    totalDueCents: statement.totalOutstandingCents,
    openInvoices: statement.openInvoices,
    portalUrls,
  });

  const result: SendEmailResult = await sendEmail({
    to: customer.email,
    subject: `Statement from ${entity.name} — ${formatCents(statement.totalOutstandingCents)} due`,
    html,
  });

  return {
    customerId: customer.id,
    customerName: customer.name,
    email: customer.email,
    balanceCents: statement.totalOutstandingCents,
    sent: result.ok,
    stubbed: !!result.stubbed,
    error: result.error,
  };
}
