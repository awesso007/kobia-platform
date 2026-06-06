import { getTenantDb } from "@/lib/db/get-tenant-db";

export type QuoteListRow = {
  id: string;
  number: string;
  title: string;
  status: string;
  totalCents: number;
  currency: string;
  contactName: string | null;
  dealName: string | null;
  createdAt: string;
};

export type QuoteListResult = {
  rows: QuoteListRow[];
  total: number;
  page: number;
  pageSize: number;
};

const PAGE_SIZE = 25;

export async function getQuotes(opts: { status?: string; q?: string; page?: number }): Promise<QuoteListResult> {
  const { db } = getTenantDb();
  const page = Math.max(1, opts.page ?? 1);
  const where: Record<string, unknown> = {};
  if (opts.status) where.status = opts.status;
  if (opts.q?.trim()) {
    const t = opts.q.trim();
    where.OR = [
      { number: { contains: t, mode: "insensitive" } },
      { title: { contains: t, mode: "insensitive" } },
    ];
  }

  const [quotes, total] = await Promise.all([
    db.quote.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { deal: { select: { name: true } } },
    }),
    db.quote.count({ where }),
  ]);

  const contactIds = quotes.map((q) => q.contactId).filter((x): x is string => !!x);
  const contacts = contactIds.length
    ? await db.contact.findMany({ where: { id: { in: contactIds } }, select: { id: true, firstName: true, lastName: true, email: true } })
    : [];
  const contactMap = new Map(contacts.map((c) => [c.id, [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email]));

  return {
    rows: quotes.map((q) => ({
      id: q.id,
      number: q.number,
      title: q.title,
      status: q.status,
      totalCents: q.totalCents,
      currency: q.currency,
      contactName: q.contactId ? contactMap.get(q.contactId) ?? null : null,
      dealName: q.deal?.name ?? null,
      createdAt: q.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
  };
}

export type QuoteDetail = {
  id: string;
  number: string;
  title: string;
  status: string;
  currency: string;
  notes: string | null;
  termsAndConditions: string | null;
  dealId: string | null;
  contactId: string | null;
  companyId: string | null;
  templateId: string | null;
  expiresAt: string | null;
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  publicSlug: string;
  pdfFileId: string | null;
  lineItems: {
    id: string;
    productId: string | null;
    name: string;
    description: string | null;
    quantity: number;
    unitPriceCents: number;
    discountPct: number;
    taxRatePct: number;
    lineTotalCents: number;
    sortOrder: number;
  }[];
};

export type QuoteBuilderData = {
  quote: QuoteDetail;
  contacts: { id: string; label: string }[];
  companies: { id: string; name: string }[];
  deals: { id: string; name: string }[];
  templates: { id: string; name: string }[];
  products: { id: string; sku: string; name: string; unitPriceCents: number; taxable: boolean }[];
};

export async function getQuoteBuilder(id: string): Promise<QuoteBuilderData | null> {
  const { db } = getTenantDb();
  const q = await db.quote.findUnique({ where: { id }, include: { lineItems: { orderBy: { sortOrder: "asc" } } } });
  if (!q) return null;

  const [contacts, companies, deals, templates, products] = await Promise.all([
    db.contact.findMany({ orderBy: { createdAt: "desc" }, take: 200, select: { id: true, firstName: true, lastName: true, email: true } }),
    db.company.findMany({ orderBy: { name: "asc" }, take: 200, select: { id: true, name: true } }),
    db.deal.findMany({ orderBy: { createdAt: "desc" }, take: 200, select: { id: true, name: true } }),
    db.quoteTemplate.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.product.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, sku: true, name: true, unitPriceCents: true, taxable: true } }),
  ]);

  return {
    quote: {
      id: q.id,
      number: q.number,
      title: q.title,
      status: q.status,
      currency: q.currency,
      notes: q.notes,
      termsAndConditions: q.termsAndConditions,
      dealId: q.dealId,
      contactId: q.contactId,
      companyId: q.companyId,
      templateId: q.templateId,
      expiresAt: q.expiresAt ? q.expiresAt.toISOString().slice(0, 10) : null,
      subtotalCents: q.subtotalCents,
      discountCents: q.discountCents,
      taxCents: q.taxCents,
      totalCents: q.totalCents,
      publicSlug: q.publicSlug,
      pdfFileId: q.pdfFileId,
      lineItems: q.lineItems.map((l) => ({
        id: l.id,
        productId: l.productId,
        name: l.name,
        description: l.description,
        quantity: Number(l.quantity),
        unitPriceCents: l.unitPriceCents,
        discountPct: Number(l.discountPct),
        taxRatePct: Number(l.taxRatePct),
        lineTotalCents: l.lineTotalCents,
        sortOrder: l.sortOrder,
      })),
    },
    contacts: contacts.map((c) => ({ id: c.id, label: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || c.id })),
    companies: companies.map((c) => ({ id: c.id, name: c.name })),
    deals: deals.map((d) => ({ id: d.id, name: d.name })),
    templates: templates.map((t) => ({ id: t.id, name: t.name })),
    products,
  };
}
