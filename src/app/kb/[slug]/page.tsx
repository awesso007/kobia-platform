/*
 * Public KB article (Sprint 15). Unauthenticated, tenant resolved from a
 * validated `?t=<slug>` query. Only PUBLISHED + PUBLIC articles are viewable.
 * Records a view (increment + KB_ARTICLE_VIEWED dispatch) then renders the body
 * with a helpful/not-helpful voter.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { getTenantPrisma, schemaNameForSlug } from "@/lib/db/tenant-prisma";
import { recordArticleView } from "@/lib/helpdesk/kb";
import { ArticleFeedback } from "../PublicKbUI";

export const dynamic = "force-dynamic";

function sanitizeSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(slug) ? slug : null;
}

export default async function PublicKbArticle({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const q = (k: string) => (Array.isArray(searchParams[k]) ? searchParams[k]?.[0] : searchParams[k]) as string | undefined;
  const tenant = sanitizeSlug(q("t")) ?? sanitizeSlug(q("tenant"));
  if (!tenant) return <Shell><Unavailable /></Shell>;

  try {
    const db = getTenantPrisma(schemaNameForSlug(tenant));
    const article = await db.kbArticle.findUnique({ where: { slug: params.slug } });
    if (!article || article.status !== "PUBLISHED" || article.visibility !== "PUBLIC") {
      return <Shell><Unavailable /></Shell>;
    }
    await recordArticleView(db, article.id).catch(() => undefined);
    const tq = `?t=${encodeURIComponent(tenant)}`;
    return (
      <Shell>
        <Link href={`/kb${tq}`} className="text-sm text-slate-500 hover:underline">
          Back to knowledge base
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-slate-900">{article.title}</h1>
        {article.summary ? <p className="mt-1 text-sm text-slate-500">{article.summary}</p> : null}
        <article
          className="prose mt-6 max-w-none text-sm text-slate-800"
          dangerouslySetInnerHTML={{ __html: article.bodyHtml }}
        />
        <div className="mt-8 border-t border-slate-200 pt-4">
          <ArticleFeedback tenant={tenant} articleId={article.id} />
        </div>
      </Shell>
    );
  } catch {
    return <Shell><Unavailable /></Shell>;
  }
}

function Unavailable() {
  return (
    <>
      <p className="text-base text-slate-700">This article is not available.</p>
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
