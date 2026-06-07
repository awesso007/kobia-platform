/*
 * KB categories admin (Sprint 15). Lists knowledge-base categories and lets
 * agents add or remove them via the client KbCategoryManager.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { listKbCategories } from "../../queries";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../../CrmError";
import { PageHeader, KbCategoryManager } from "../../HelpdeskUI";

export const dynamic = "force-dynamic";

export default async function KbCategoriesPage() {
  try {
    const categories = await listKbCategories();
    return (
      <div className="p-6">
        <Link href="/app/helpdesk/kb" className="mb-4 inline-block text-sm text-slate-500 hover:underline">
          Back to knowledge base
        </Link>
        <PageHeader title="KB categories" subtitle="Organize help articles into browsable groups." />
        <KbCategoryManager
          categories={categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug }))}
        />
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
