/*
 * Landing page detail / edit page (Sprint 13).
 * No em-dashes in copy by project convention (use hyphens).
 */
import { notFound } from "next/navigation";
import { getLandingPage } from "../../queries";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../../CrmError";
import { LandingPageEditor } from "../LandingPageEditor";

export const dynamic = "force-dynamic";

export default async function LandingPageDetailPage({ params }: { params: { id: string } }) {
  try {
    const { tenantId } = getTenantDb();
    const page = await getLandingPage(params.id);
    if (!page) notFound();
    return (
      <LandingPageEditor
        tenantSlug={tenantId}
        page={{
          id: page.id,
          slug: page.slug,
          title: page.title,
          status: page.status,
          htmlContent: page.htmlContent,
          cssContent: page.cssContent,
          metaTitle: page.metaTitle,
          metaDescription: page.metaDescription,
          ogImage: page.ogImage,
        }}
      />
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
