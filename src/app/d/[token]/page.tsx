/*
 * Public document share viewer (Sprint 14). Unauthenticated, token-gated.
 * Resolves the tenant from a validated `?t=<slug>` query param, loads the share
 * link by token, enforces expiresAt, and (when a password is set) verifies the
 * `?pw=` query param against the stored scrypt hash before rendering. DOC bodies
 * render inline; FILE documents offer a download when allowDownload is set.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantPrisma, schemaNameForSlug } from "@/lib/db/tenant-prisma";
import { verifySharePassword } from "@/lib/files/files";
import { isShareLinkLive } from "@/lib/documents/documents";
import { PasswordGate } from "./PasswordGate";

export const dynamic = "force-dynamic";

function sanitizeSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(slug) ? slug : null;
}

export default async function ShareViewerPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const q = (k: string) => (Array.isArray(searchParams[k]) ? searchParams[k]?.[0] : searchParams[k]) as string | undefined;
  const tenant = sanitizeSlug(q("t")) ?? sanitizeSlug(q("tenant"));
  const pw = q("pw");

  const unavailable = (
    <Shell>
      <p className="text-base text-slate-700">This document is not available.</p>
      <p className="mt-1 text-sm text-slate-500">The link may be invalid or expired.</p>
    </Shell>
  );

  if (!tenant) return unavailable;

  try {
    const db = getTenantPrisma(schemaNameForSlug(tenant));
    const link = await db.documentShareLink.findUnique({ where: { token: params.token } });
    if (!link || !isShareLinkLive(link)) return unavailable;

    if (link.password) {
      if (!pw) return <Shell><PasswordGate tenant={tenant} /></Shell>;
      if (!verifySharePassword(pw, link.password)) {
        return <Shell><PasswordGate tenant={tenant} error /></Shell>;
      }
    }

    const doc = await db.document.findUnique({ where: { id: link.documentId } });
    if (!doc) return unavailable;

    return (
      <Shell>
        <h1 className="text-xl font-semibold text-slate-900">{doc.name}</h1>
        <p className="mt-1 text-sm text-slate-500">{doc.mimeType ?? doc.kind}</p>
        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          {doc.kind === "DOC" && doc.bodyHtml ? (
            <div
              className="prose max-w-none text-sm text-slate-800"
              dangerouslySetInnerHTML={{ __html: doc.bodyHtml }}
            />
          ) : link.allowDownload ? (
            <p className="text-sm text-slate-700">
              This is a file document. Downloading is enabled by the sender, but no preview is available here.
            </p>
          ) : (
            <p className="text-sm text-slate-700">This document has no inline preview.</p>
          )}
        </div>
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
