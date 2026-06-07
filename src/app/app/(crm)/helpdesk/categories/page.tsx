/*
 * Ticket categories admin (Sprint 15). Lists categories with their SLA mapping
 * and lets agents add or remove them via the client CategoryManager.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { listCategories, listSlaPolicies } from "../queries";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../CrmError";
import { HelpdeskTabs, PageHeader, CategoryManager } from "../HelpdeskUI";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  try {
    const [categories, slaPolicies] = await Promise.all([listCategories(), listSlaPolicies()]);
    return (
      <div className="p-6">
        <PageHeader
          title="Categories"
          subtitle="Classify tickets and attach a default SLA policy per category."
        />
        <HelpdeskTabs active="/app/helpdesk/categories" />
        <CategoryManager
          categories={categories.map((c) => ({
            id: c.id,
            name: c.name,
            color: c.color,
            slaPolicy: c.slaPolicy ? { name: c.slaPolicy.name } : null,
          }))}
          slaPolicies={slaPolicies.map((s) => ({ id: s.id, name: s.name }))}
        />
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
