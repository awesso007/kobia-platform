/**
 * W-9 request emails — bulk-send a W-9 request to 1099 vendors missing a Tax ID.
 *
 * Per IRS, you can't file a 1099-NEC without the vendor's TIN. Request a W-9
 * before January 31. This helper composes and sends the email; storing send
 * timestamps is a future enhancement.
 */
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";

export interface W9RequestResult {
  vendorId: string;
  vendorName: string;
  email: string | null;
  sent: boolean;
  stubbed?: boolean;
  error?: string;
}

function w9Html(args: {
  vendorName: string;
  payerName: string;
  payerContact?: string | null;
}): string {
  const { vendorName, payerName, payerContact } = args;
  return `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;background:#f8fafc;margin:0;padding:24px">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;padding:24px">
    <h2 style="margin:0 0 12px 0;color:#0f172a">W-9 Requested</h2>
    <p>Hi ${vendorName},</p>
    <p>
      ${payerName} needs your completed IRS Form W-9 on file so we can issue
      your 1099-NEC at year-end. You can download the form here:
      <a href="https://www.irs.gov/pub/irs-pdf/fw9.pdf">IRS Form W-9 (PDF)</a>.
    </p>
    <p>Please reply to this email with the completed W-9, or send it to ${payerContact ?? "your contact at " + payerName}.</p>
    <p style="color:#475569;font-size:13px;margin-top:24px">
      Why we need this: Per IRS rules, vendors paid $600+ for services in a calendar year
      receive a 1099-NEC. We can't file that form without your Taxpayer Identification Number.
    </p>
    <p style="margin-top:24px">Thanks,<br/>${payerName}</p>
  </div>
</body></html>`;
}

function w9Text(args: { vendorName: string; payerName: string; payerContact?: string | null }): string {
  const { vendorName, payerName, payerContact } = args;
  return `Hi ${vendorName},

${payerName} needs your completed IRS Form W-9 on file so we can issue your 1099-NEC at year-end.

Download the form: https://www.irs.gov/pub/irs-pdf/fw9.pdf

Please reply to this email with the completed W-9, or send it to ${payerContact ?? "your contact at " + payerName}.

Why we need this: Per IRS rules, vendors paid $600+ for services in a calendar year receive a 1099-NEC. We can't file that form without your Taxpayer Identification Number.

Thanks,
${payerName}
`;
}

export async function sendW9Request(args: {
  vendorId: string;
  tenantId: string;
  entityId: string;
}): Promise<W9RequestResult> {
  const vendor = await db.vendor.findFirst({
    where: { id: args.vendorId, tenantId: args.tenantId, entityId: args.entityId },
  });
  if (!vendor) {
    return { vendorId: args.vendorId, vendorName: "(unknown)", email: null, sent: false, error: "Vendor not found" };
  }
  if (!vendor.email) {
    return { vendorId: vendor.id, vendorName: vendor.name, email: null, sent: false, error: "No email on file" };
  }

  const entity = await db.entity.findFirst({ where: { id: args.entityId, tenantId: args.tenantId } });
  const payerName = entity?.name ?? "Your client";

  const result = await sendEmail({
    to: vendor.email,
    subject: `W-9 Requested — ${payerName}`,
    html: w9Html({ vendorName: vendor.name, payerName }),
    text: w9Text({ vendorName: vendor.name, payerName }),
  });

  if (!result.ok) {
    return { vendorId: vendor.id, vendorName: vendor.name, email: vendor.email, sent: false, error: result.error };
  }
  return { vendorId: vendor.id, vendorName: vendor.name, email: vendor.email, sent: true, stubbed: result.stubbed };
}

export async function sendAllMissingW9Requests(args: {
  tenantId: string;
  entityId: string;
  year: number;
}): Promise<W9RequestResult[]> {
  const thresholdCents = 60000n;
  const yearStart = new Date(Date.UTC(args.year, 0, 1));
  const yearEnd = new Date(Date.UTC(args.year + 1, 0, 1));

  // Find 1099 vendors paid >= $600 YTD AND missing taxId.
  const vendors = await db.vendor.findMany({
    where: {
      tenantId: args.tenantId,
      entityId: args.entityId,
      is1099Vendor: true,
      taxId: null,
    },
    include: {
      bills: {
        select: {
          payments: {
            where: { paymentDate: { gte: yearStart, lt: yearEnd } },
            select: { amountCents: true },
          },
        },
      },
    },
  });

  const targets = vendors.filter((v) => {
    const paidYTD = v.bills.reduce(
      (sum, b) => sum + b.payments.reduce((s, p) => s + p.amountCents, 0n),
      0n,
    );
    return paidYTD >= thresholdCents;
  });

  const results: W9RequestResult[] = [];
  for (const v of targets) {
    results.push(
      await sendW9Request({ vendorId: v.id, tenantId: args.tenantId, entityId: args.entityId }),
    );
  }
  return results;
}
