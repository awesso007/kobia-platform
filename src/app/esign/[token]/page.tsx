/*
 * Public e-signature signing page (Sprint 14). Unauthenticated, token-gated.
 * Resolves the tenant from a validated `?t=<slug>` query param, loads the signer
 * by token, records a VIEWED audit event, and renders the document body with a
 * typed-signature form. The signing POST goes to /api/esign/[token]/complete.
 *
 * Note: we deliberately use /esign rather than /sign because /sign/[token] is
 * already taken by the accounting product's engagement-letter signing route.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantPrisma, schemaNameForSlug } from "@/lib/db/tenant-prisma";
import { htmlToText } from "@/lib/documents/documents";
import { markViewed } from "@/lib/documents/envelopes";
import { SignForm } from "./SignForm";

export const dynamic = "force-dynamic";

function sanitizeSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(slug) ? slug : null;
}

export default async function EsignPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const q = (k: string) => (Array.isArray(searchParams[k]) ? searchParams[k]?.[0] : searchParams[k]) as string | undefined;
  const tenant = sanitizeSlug(q("t")) ?? sanitizeSlug(q("tenant"));

  const unavailable = (
    <Shell>
      <p className="text-base text-slate-700">This signing link is not available.</p>
      <p className="mt-1 text-sm text-slate-500">The link may be invalid, expired, or already completed.</p>
    </Shell>
  );

  if (!tenant) return unavailable;

  try {
    const db = getTenantPrisma(schemaNameForSlug(tenant));
    const signer = await db.envelopeSigner.findUnique({ where: { token: params.token } });
    if (!signer) return unavailable;

    const envelope = await db.envelope.findUnique({
      where: { id: signer.envelopeId },
      include: { document: { select: { name: true, bodyHtml: true, kind: true } } },
    });
    if (!envelope) return unavailable;

    await markViewed(db, params.token).catch(() => undefined);

    const signed = signer.status === "SIGNED";
    const closed = envelope.status === "VOIDED" || envelope.status === "COMPLETED";
    const bodyText = htmlToText(envelope.document?.bodyHtml, 5000);

    return (
      <Shell>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Signature request</div>
        <h1 className="text-xl font-semibold text-slate-900">{envelope.name}</h1>
        <p className="mt-1 text-sm text-slate-500">Document: {envelope.document?.name ?? "(removed)"}</p>

        {envelope.message ? (
          <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            {envelope.message}
          </div>
        ) : null}

        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          {bodyText ? (
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-800">{bodyText}</pre>
          ) : (
            <p className="text-sm text-slate-500">This document has no inline preview. Please review with the sender.</p>
          )}
        </div>

        {signed ? (
          <div className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            You signed this document on {signer.signedAt ? new Date(signer.signedAt).toLocaleString() : "file"}.
          </div>
        ) : closed ? (
          <div className="mt-6 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            This envelope is {envelope.status.toLowerCase()} and is no longer available for signing.
          </div>
        ) : (
          <SignForm token={params.token} tenant={tenant} signerName={signer.name} />
        )}
      </Shell>
    );
  } catch {
    return unavailable;
  }
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-3xl">{children}</div>
    </div>
  );
}
