/*
 * Public knowledge base index (Sprint 15). Unauthenticated, tenant resolved from
 * a validated `?t=<slug>` query. Lists PUBLISHED + PUBLIC articles grouped by
 * category. The authenticated admin KB lives at /app/helpdesk/kb.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { getTenantPrisma, schemaNameForSlug } from "@/lib/db/tenant-prisma";

export const dynamic = "force-dynamic";

function sanitizeSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(slug) ? slug : null;
}

export default async function PublicKbIndex({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const q = (k: string) => (Array.isArray(searchParams[k]) ? searchParams[k]?.[0] : searchParams[k]) as string | undefined;
  const tenant = sanitizeSlug(q("t")) ?? sanitizeSlug(q("tenant"));
  if (!tenant) return <Shell><Unavailable /></Shell>;

  try {
    const db = getTenantPrisma(schemaNameForSlug(tenant));
    const articles = await db.kbArticle.findMany({
      where: { status: "PUBLISHED", visibility: "PUBLIC" },
      orderBy: { updatedAt: "desc" },
      select: { id: true, slug: true, title: true, summary: true },
    });
    const tq = `?t=${encodeURIComponent(tenant)}`;
    return (
      <Shell>
        <h1 className="text-2xl font-semibold text-slate-900">Knowledge base</h1>
        <p className="mt-1 text-sm text-slate-500">Browse help articles and guides.</p>
        <ul className="mt-6 space-y-3">
          {articles.map((a) => (
            <li key={a.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <Link href={`/kb/${a.slug}${tq}`} className="text-base font-medium text-slate-900 hover:underline">
                {a.title}
              </Link>
              {a.summary ? <p className="mt-1 text-sm text-slate-500">{a.summary}</p> : null}
            </li>
          ))}
          {articles.length === 0 ? (
            <li className="text-sm text-slate-500">No articles published yet.</li>
          ) : null}
        </ul>
      </Shell>
    );
  } catch {
    return <Shell><Unavailable /></Shell>;
  }
}

function Unavailable() {
  return (
    <>
      <p className="text-base text-slate-700">This knowledge base is not available.</p>
      <p className="mt-1 text-sm text-slate-500">The link may be invalid.</p>
    </>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-3xl">{children}</div>
    </div>
  );
}
