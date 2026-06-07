/*
 * Page editor (Sprint 17). Three-pane editor: block palette (left), block list
 * with reorder + edit-in-place (center), block settings + page SEO (right). All
 * mutations run through the client PageEditor.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../../../CrmError";
import { pageEditorData } from "../../../queries";
import { PageHeader, PageEditor } from "../../../SitesUI";

export const dynamic = "force-dynamic";

export default async function PageEditorPage({ params }: { params: { siteId: string; pageId: string } }) {
  try {
    const data = await pageEditorData(params.siteId, params.pageId);
    if (!data) notFound();
    const { site, page } = data;
    return (
      <div className="p-6">
        <PageHeader
          title={page.title}
          subtitle={`${site.name} / ${page.slug}`}
          action={
            <Link href={`/app/sites/${site.id}/pages`} className="text-sm hover:underline" style={{ color: "var(--kb-primary)" }}>
              Back to pages
            </Link>
          }
        />
        <PageEditor
          siteId={site.id}
          page={{
            id: page.id,
            title: page.title,
            slug: page.slug,
            published: page.published,
            seoTitle: page.seoTitle,
            seoDescription: page.seoDescription,
            ogImageUrl: page.ogImageUrl,
            blocks: page.blocks.map((b) => ({ id: b.id, type: b.type, order: b.order, visible: b.visible, data: b.data })),
          }}
        />
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
