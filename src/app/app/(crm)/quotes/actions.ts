"use server";

/*
 * Quotes server actions (Sprint 10). A Quote is a customer-facing priced
 * document built from line items (often copied from a Deal). Numbers are auto
 * (Q-YYYYMM-NNNN) and a publicSlug gates the public /quote/[slug] view.
 * lineTotalCents on QuoteLineItem is a DB GENERATED column - never write it.
 * Totals (subtotal/discount/tax/total) are recomputed and stored on the Quote.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { auditWrite } from "@/lib/crm/audit";
import { requirePermission, getCurrentMembership } from "@/lib/rbac/require-permission";
import { dispatchAutomation } from "@/lib/automations/dispatch";
import { notify } from "@/lib/notifications/notify";

const QUOTE_STATUSES = ["DRAFT", "SENT", "VIEWED", "ACCEPTED", "DECLINED", "EXPIRED"] as const;
type QuoteStatus = (typeof QUOTE_STATUSES)[number];

function clampPct(v: number | undefined): number {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

function publicSlug(): string {
  return randomBytes(12).toString("base64url");
}

/** Allocate the next quote number for the current month: Q-YYYYMM-NNNN. */
async function nextQuoteNumber(db: ReturnType<typeof getTenantDb>["db"]): Promise<string> {
  const now = new Date();
  const ym = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const prefix = `Q-${ym}-`;
  const last = await db.quote.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  let n = 1;
  if (last) {
    const tail = Number(last.number.slice(prefix.length));
    if (Number.isFinite(tail)) n = tail + 1;
  }
  return `${prefix}${String(n).padStart(4, "0")}`;
}

export type QuoteLineInput = {
  productId?: string | null;
  name: string;
  description?: string | null;
  quantity?: number;
  unitPriceCents: number;
  discountPct?: number;
  taxRatePct?: number;
};

/** Recompute and persist subtotal/discount/tax/total on a quote. Returns the totals. */
export async function recomputeQuoteTotals(quoteId: string) {
  const { db } = getTenantDb();
  const items = await db.quoteLineItem.findMany({ where: { quoteId } });
  let subtotal = 0;
  let discount = 0;
  let tax = 0;
  for (const i of items) {
    const gross = Number(i.quantity) * i.unitPriceCents;
    const disc = gross * (Number(i.discountPct) / 100);
    const net = gross - disc;
    tax += net * (Number(i.taxRatePct) / 100);
    subtotal += gross;
    discount += disc;
  }
  const totals = {
    subtotalCents: Math.round(subtotal),
    discountCents: Math.round(discount),
    taxCents: Math.round(tax),
    totalCents: Math.round(subtotal - discount + tax),
  };
  await db.quote.update({ where: { id: quoteId }, data: totals });
  return totals;
}

export async function createQuote(input: {
  title?: string;
  dealId?: string | null;
  contactId?: string | null;
  companyId?: string | null;
  templateId?: string | null;
  copyDealLineItems?: boolean;
}): Promise<string> {
  await requirePermission("record:create");
  const { db } = getTenantDb();
  const me = await getCurrentMembership();

  const template = input.templateId
    ? await db.quoteTemplate.findUnique({ where: { id: input.templateId } })
    : await db.quoteTemplate.findFirst({ orderBy: { createdAt: "asc" } });

  let title = input.title?.trim();
  let dealId = input.dealId || null;
  let contactId = input.contactId || null;
  if (dealId) {
    const deal = await db.deal.findUnique({ where: { id: dealId } });
    if (deal) {
      title = title || `Quote for ${deal.name}`;
      contactId = contactId || deal.contactId;
    }
  }

  const quote = await db.quote.create({
    data: {
      number: await nextQuoteNumber(db),
      title: title || "New quote",
      dealId,
      contactId,
      companyId: input.companyId || null,
      templateId: template?.id ?? null,
      status: "DRAFT",
      publicSlug: publicSlug(),
      notes: template?.defaultNotes ?? null,
      termsAndConditions: template?.defaultTerms ?? null,
      ownerClerkUserId: me?.clerkUserId ?? null,
    },
  });

  if (input.copyDealLineItems && dealId) {
    const lines = await db.dealLineItem.findMany({ where: { dealId }, orderBy: { sortOrder: "asc" } });
    if (lines.length > 0) {
      await db.quoteLineItem.createMany({
        data: lines.map((l, idx) => ({
          quoteId: quote.id,
          productId: l.productId,
          name: l.name,
          description: l.description,
          quantity: l.quantity,
          unitPriceCents: l.unitPriceCents,
          discountPct: l.discountPct,
          taxRatePct: l.taxRatePct,
          sortOrder: idx,
        })),
      });
      await recomputeQuoteTotals(quote.id);
    }
  }

  await auditWrite({ action: "CREATE", entityType: "COMPANY", entityId: quote.id, diff: { kind: "Quote", number: quote.number } });
  revalidatePath("/app/quotes");
  return quote.id;
}

export async function updateQuote(id: string, input: {
  title?: string;
  status?: string;
  dealId?: string | null;
  contactId?: string | null;
  companyId?: string | null;
  templateId?: string | null;
  notes?: string | null;
  termsAndConditions?: string | null;
  expiresAt?: string | null;
}): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  const data: Record<string, unknown> = {};
  if (input.title !== undefined) { const v = input.title.trim(); if (!v) throw new Error("Quote title is required."); data.title = v; }
  if (input.status !== undefined && QUOTE_STATUSES.includes(input.status as QuoteStatus)) data.status = input.status;
  if (input.dealId !== undefined) data.dealId = input.dealId || null;
  if (input.contactId !== undefined) data.contactId = input.contactId || null;
  if (input.companyId !== undefined) data.companyId = input.companyId || null;
  if (input.templateId !== undefined) data.templateId = input.templateId || null;
  if (input.notes !== undefined) data.notes = input.notes || null;
  if (input.termsAndConditions !== undefined) data.termsAndConditions = input.termsAndConditions || null;
  if (input.expiresAt !== undefined) data.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  await db.quote.update({ where: { id }, data });
  await auditWrite({ action: "UPDATE", entityType: "COMPANY", entityId: id, diff: { kind: "Quote", ...data } });
  revalidatePath("/app/quotes");
  revalidatePath(`/app/quotes/${id}`);
}

export async function deleteQuote(id: string): Promise<void> {
  await requirePermission("record:delete");
  const { db } = getTenantDb();
  await db.quote.delete({ where: { id } });
  await auditWrite({ action: "DELETE", entityType: "COMPANY", entityId: id, diff: { kind: "Quote" } });
  revalidatePath("/app/quotes");
}

// ---- Line items ------------------------------------------------------------

export async function createQuoteLine(quoteId: string, input: QuoteLineInput): Promise<string> {
  await requirePermission("record:update");
  const name = input.name?.trim();
  if (!name) throw new Error("Line item name is required.");
  const { db } = getTenantDb();
  const max = await db.quoteLineItem.aggregate({ where: { quoteId }, _max: { sortOrder: true } });
  const item = await db.quoteLineItem.create({
    data: {
      quoteId,
      productId: input.productId || null,
      name,
      description: input.description?.trim() || null,
      quantity: input.quantity != null && Number.isFinite(input.quantity) ? input.quantity : 1,
      unitPriceCents: Math.round(input.unitPriceCents || 0),
      discountPct: clampPct(input.discountPct),
      taxRatePct: clampPct(input.taxRatePct),
      sortOrder: (max._max.sortOrder ?? 0) + 1,
    },
  });
  await recomputeQuoteTotals(quoteId);
  revalidatePath(`/app/quotes/${quoteId}`);
  return item.id;
}

export async function updateQuoteLine(id: string, input: Partial<QuoteLineInput>): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  const existing = await db.quoteLineItem.findUniqueOrThrow({ where: { id } });
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) { const v = input.name.trim(); if (!v) throw new Error("Line item name is required."); data.name = v; }
  if (input.description !== undefined) data.description = input.description?.trim() || null;
  if (input.quantity !== undefined && Number.isFinite(input.quantity)) data.quantity = input.quantity;
  if (input.unitPriceCents !== undefined) data.unitPriceCents = Math.round(input.unitPriceCents || 0);
  if (input.discountPct !== undefined) data.discountPct = clampPct(input.discountPct);
  if (input.taxRatePct !== undefined) data.taxRatePct = clampPct(input.taxRatePct);
  await db.quoteLineItem.update({ where: { id }, data });
  await recomputeQuoteTotals(existing.quoteId);
  revalidatePath(`/app/quotes/${existing.quoteId}`);
}

export async function deleteQuoteLine(id: string): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  const existing = await db.quoteLineItem.findUniqueOrThrow({ where: { id } });
  await db.quoteLineItem.delete({ where: { id } });
  await recomputeQuoteTotals(existing.quoteId);
  revalidatePath(`/app/quotes/${existing.quoteId}`);
}

// ---- Send / accept / decline ----------------------------------------------

/**
 * Mark a quote SENT: generate the PDF, set status + sentAt, optionally email the
 * contact when an email account is configured, and notify the owner.
 */
export async function sendQuote(id: string): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  const quote = await db.quote.findUniqueOrThrow({ where: { id }, include: { lineItems: true } });

  const { generateAndStoreQuotePdf } = await import("./pdf");
  try {
    await generateAndStoreQuotePdf(id);
  } catch {
    // PDF generation is best-effort here; the /api route can regenerate on demand.
  }

  await db.quote.update({ where: { id }, data: { status: "SENT", sentAt: new Date() } });

  const contact = quote.contactId ? await db.contact.findUnique({ where: { id: quote.contactId } }) : null;
  if (contact?.email) {
    const account = await db.emailAccount.findFirst({ orderBy: { createdAt: "asc" } });
    if (account) {
      try {
        const { sendEmail } = await import("@/lib/email/send");
        const link = `/quote/${quote.publicSlug}`;
        await sendEmail({
          accountId: account.id,
          to: [contact.email],
          subject: `Quote ${quote.number}: ${quote.title}`,
          html: `<p>Please review your quote here: <a href="${link}">${quote.title}</a>.</p>`,
          text: `Please review your quote: ${link}`,
        });
      } catch {
        // Email is optional; ignore failures (e.g. SMTP not reachable).
      }
    }
  }

  if (quote.ownerClerkUserId) {
    await notify(quote.ownerClerkUserId, { type: "SYSTEM", title: `Quote ${quote.number} sent`, linkUrl: `/app/quotes/${id}` });
  }

  await auditWrite({ action: "UPDATE", entityType: "COMPANY", entityId: id, diff: { kind: "Quote", status: "SENT" } });
  await dispatchAutomation({ type: "QUOTE_SENT", entityType: quote.dealId ? "DEAL" : "COMPANY", entityId: quote.dealId ?? id, changedFields: ["status"] });
  revalidatePath("/app/quotes");
  revalidatePath(`/app/quotes/${id}`);
}

/** Convert a quote into a deal (when it has no parent deal yet). Returns the deal id. */
export async function convertQuoteToDeal(id: string): Promise<string> {
  await requirePermission("record:create");
  const { db } = getTenantDb();
  const quote = await db.quote.findUniqueOrThrow({ where: { id }, include: { lineItems: { orderBy: { sortOrder: "asc" } } } });
  if (quote.dealId) return quote.dealId;

  const pipeline =
    (await db.pipeline.findFirst({ where: { isDefault: true, entityType: "DEAL" }, include: { stages: { orderBy: { sortOrder: "asc" } } } })) ??
    (await db.pipeline.findFirst({ where: { entityType: "DEAL" }, orderBy: { createdAt: "asc" }, include: { stages: { orderBy: { sortOrder: "asc" } } } }));
  if (!pipeline || pipeline.stages.length === 0) throw new Error("No deal pipeline with stages exists.");
  const firstStage = pipeline.stages[0]!;

  const deal = await db.deal.create({
    data: {
      name: quote.title,
      pipelineId: pipeline.id,
      stageId: firstStage.id,
      contactId: quote.contactId,
      amountCents: BigInt(quote.totalCents),
    },
  });

  if (quote.lineItems.length > 0) {
    await db.dealLineItem.createMany({
      data: quote.lineItems.map((l, idx) => ({
        dealId: deal.id,
        productId: l.productId,
        name: l.name,
        description: l.description,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
        discountPct: l.discountPct,
        taxRatePct: l.taxRatePct,
        sortOrder: idx,
      })),
    });
  }

  await db.quote.update({ where: { id }, data: { dealId: deal.id } });
  await auditWrite({ action: "CREATE", entityType: "DEAL", entityId: deal.id, diff: { fromQuote: quote.number } });
  revalidatePath("/app/quotes");
  revalidatePath("/app/deals");
  return deal.id;
}
