/*
 * KB article editor (Sprint 15). Loads the article and KB categories and renders
 * the client KbEditor in edit mode (save / delete via server actions).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { getKbArticle, listKbCategories } from "../../queries";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../../CrmError";
import { PageHeader, KbEditor } from "../../HelpdeskUI";

export const dynamic = "force-dynamic";

export default async function KbArticlePage({ params }: { params: { id: string } }) {
  try {
    const [article, categories] = await Promise.all([
      getKbArticle(params.id),
      listKbCategories(),
    ]);
    if (!article) notFound();
    return (
      <div className="p-6">
        <Link href="/app/helpdesk/kb" className="mb-4 inline-block text-sm text-slate-500 hover:underline">
          Back to knowledge base
        </Link>
        <PageHeader title="Edit article" subtitle={`/kb/${article.slug}`} />
        <KbEditor
          article={{
            id: article.id,
            title: article.title,
            bodyHtml: article.bodyHtml,
            summary: article.summary,
            categoryId: article.categoryId,
            status: article.status,
            visibility: article.visibility,
          }}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        />
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
