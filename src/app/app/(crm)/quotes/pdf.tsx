/*
 * Quote PDF rendering (Sprint 10). Primary renderer is @react-pdf/renderer.
 * generateQuotePdfBuffer builds the document and returns a Buffer.
 * generateAndStoreQuotePdf persists it through the Sprint 8 File system
 * (source=AUTOMATION) and sets Quote.pdfFileId. This module is server-only.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import React from "react";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { ingestObject } from "@/lib/storage";

type QuoteForPdf = {
  number: string;
  title: string;
  currency: string;
  notes: string | null;
  termsAndConditions: string | null;
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  primaryColor: string;
  contactName: string | null;
  lineItems: {
    name: string;
    description: string | null;
    quantity: number;
    unitPriceCents: number;
    discountPct: number;
    taxRatePct: number;
    lineTotalCents: number;
  }[];
};

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(cents / 100);
}

function buildStyles(primary: string) {
  return StyleSheet.create({
    page: { padding: 40, fontSize: 10, color: "#1f2937", fontFamily: "Helvetica" },
    header: { borderBottomWidth: 3, borderBottomColor: primary, paddingBottom: 10, marginBottom: 16 },
    h1: { fontSize: 20, color: primary, fontFamily: "Helvetica-Bold" },
    meta: { fontSize: 10, color: "#6b7280", marginTop: 4 },
    section: { marginBottom: 14 },
    label: { fontSize: 9, color: "#6b7280", marginBottom: 4, fontFamily: "Helvetica-Bold" },
    tableHead: { flexDirection: "row", backgroundColor: "#f3f4f6", paddingVertical: 6, paddingHorizontal: 4 },
    row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e5e7eb", paddingVertical: 5, paddingHorizontal: 4 },
    cName: { flex: 4 },
    cNum: { flex: 1, textAlign: "right" },
    cTot: { flex: 1.4, textAlign: "right" },
    th: { fontFamily: "Helvetica-Bold", fontSize: 9 },
    totals: { marginTop: 12, marginLeft: "auto", width: 220 },
    totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
    grand: { flexDirection: "row", justifyContent: "space-between", paddingTop: 6, marginTop: 4, borderTopWidth: 1, borderTopColor: primary },
    grandText: { fontFamily: "Helvetica-Bold", fontSize: 12, color: primary },
    notes: { marginTop: 18, fontSize: 9, color: "#374151" },
  });
}

function QuoteDocument({ quote }: { quote: QuoteForPdf }) {
  const s = buildStyles(quote.primaryColor || "#3b82f6");
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <Text style={s.h1}>{quote.title}</Text>
          <Text style={s.meta}>Quote {quote.number}</Text>
          {quote.contactName ? <Text style={s.meta}>Prepared for: {quote.contactName}</Text> : null}
        </View>

        <View style={s.tableHead}>
          <Text style={[s.cName, s.th]}>Item</Text>
          <Text style={[s.cNum, s.th]}>Qty</Text>
          <Text style={[s.cNum, s.th]}>Price</Text>
          <Text style={[s.cNum, s.th]}>Disc%</Text>
          <Text style={[s.cNum, s.th]}>Tax%</Text>
          <Text style={[s.cTot, s.th]}>Total</Text>
        </View>
        {quote.lineItems.map((l, i) => (
          <View style={s.row} key={i}>
            <View style={s.cName}>
              <Text>{l.name}</Text>
              {l.description ? <Text style={{ color: "#6b7280", fontSize: 8 }}>{l.description}</Text> : null}
            </View>
            <Text style={s.cNum}>{l.quantity}</Text>
            <Text style={s.cNum}>{money(l.unitPriceCents, quote.currency)}</Text>
            <Text style={s.cNum}>{l.discountPct}</Text>
            <Text style={s.cNum}>{l.taxRatePct}</Text>
            <Text style={s.cTot}>{money(l.lineTotalCents, quote.currency)}</Text>
          </View>
        ))}

        <View style={s.totals}>
          <View style={s.totalRow}><Text>Subtotal</Text><Text>{money(quote.subtotalCents, quote.currency)}</Text></View>
          <View style={s.totalRow}><Text>Discount</Text><Text>-{money(quote.discountCents, quote.currency)}</Text></View>
          <View style={s.totalRow}><Text>Tax</Text><Text>{money(quote.taxCents, quote.currency)}</Text></View>
          <View style={s.grand}><Text style={s.grandText}>Total</Text><Text style={s.grandText}>{money(quote.totalCents, quote.currency)}</Text></View>
        </View>

        {quote.notes ? (
          <View style={s.notes}><Text style={s.label}>Notes</Text><Text>{quote.notes}</Text></View>
        ) : null}
        {quote.termsAndConditions ? (
          <View style={s.notes}><Text style={s.label}>Terms and conditions</Text><Text>{quote.termsAndConditions}</Text></View>
        ) : null}
      </Page>
    </Document>
  );
}

async function loadQuoteForPdf(quoteId: string): Promise<QuoteForPdf> {
  const { db } = getTenantDb();
  const q = await db.quote.findUniqueOrThrow({
    where: { id: quoteId },
    include: { lineItems: { orderBy: { sortOrder: "asc" } }, template: true },
  });
  const contact = q.contactId ? await db.contact.findUnique({ where: { id: q.contactId } }) : null;
  return {
    number: q.number,
    title: q.title,
    currency: q.currency,
    notes: q.notes,
    termsAndConditions: q.termsAndConditions,
    subtotalCents: q.subtotalCents,
    discountCents: q.discountCents,
    taxCents: q.taxCents,
    totalCents: q.totalCents,
    primaryColor: q.template?.primaryColor ?? "#3b82f6",
    contactName: contact ? [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.email : null,
    lineItems: q.lineItems.map((l) => ({
      name: l.name,
      description: l.description,
      quantity: Number(l.quantity),
      unitPriceCents: l.unitPriceCents,
      discountPct: Number(l.discountPct),
      taxRatePct: Number(l.taxRatePct),
      lineTotalCents: l.lineTotalCents,
    })),
  };
}

/** Render the quote to a PDF Buffer. */
export async function generateQuotePdfBuffer(quoteId: string): Promise<{ buffer: Buffer; fileName: string }> {
  const quote = await loadQuoteForPdf(quoteId);
  const buffer = await renderToBuffer(<QuoteDocument quote={quote} />);
  return { buffer, fileName: `${quote.number}.pdf` };
}

/** Render, store through the File system, and set Quote.pdfFileId. Returns the file id. */
export async function generateAndStoreQuotePdf(quoteId: string): Promise<string> {
  const { db, schemaName } = getTenantDb();
  const tenantSlug = schemaName.replace(/^tenant_/, "").replace(/_/g, "-");
  const { buffer, fileName } = await generateQuotePdfBuffer(quoteId);

  // ingestObject writes the bytes synchronously (S3 putObject / local write),
  // so the file is already stored - mark it READY directly (no upload round-trip).
  const ingested = await ingestObject({ tenantSlug, fileName, mimeType: "application/pdf", data: buffer });
  const file = await db.file.create({
    data: {
      name: fileName,
      mimeType: "application/pdf",
      storageProvider: ingested.provider,
      storageKey: ingested.storageKey,
      storageBucket: ingested.storageBucket,
      size: BigInt(buffer.length),
      status: "READY",
      source: "AUTOMATION",
    },
  });
  await db.quote.update({ where: { id: quoteId }, data: { pdfFileId: file.id } });
  return file.id;
}
