/*
 * New KB article (Sprint 15). Server component loads KB categories and renders
 * the client KbEditor with no article (create mode).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { listKbCategories } from "../../queries";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../../CrmError";
import { PageHeader, KbEditor } from "../../HelpdeskUI";

export const dynamic = "force-dynamic";

export default async function NewKbArticlePage() {
  try {
    const categories = await listKbCategories();
    return (
      <div className="p-6">
        <Link href="/app/helpdesk/kb" className="mb-4 inline-block text-sm text-slate-500 hover:underline">
          Back to knowledge base
        </Link>
        <PageHeader title="New article" subtitle="Draft a help article for the knowledge base." />
        <KbEditor article={null} categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
