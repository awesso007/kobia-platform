/*
 * Warehouses list (Sprint 20). Server component; lists warehouses with their
 * SKU counts and default/active flags.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../CrmError";
import { listWarehouses } from "@/lib/inventory/queries";
import { PageHeader, Subnav, Card, EmptyState, Th, Td } from "../InventoryUI";

export const dynamic = "force-dynamic";

export default async function WarehousesPage() {
  try {
    const { db } = getTenantDb();
    const rows = await listWarehouses(db);
    return (
      <div className="p-6">
        <PageHeader
          title="Warehouses"
          subtitle="Locations that hold stock."
          action={
            <Link href="/app/inventory/warehouses/new" className="inline-flex items-center rounded px-3 py-1.5 text-sm font-medium text-white" style={{ backgroundColor: "var(--kb-primary)", borderRadius: "var(--kb-radius-sm)" }}>
              New warehouse
            </Link>
          }
        />
        <Subnav />
        <Card>
          {rows.length === 0 ? (
            <EmptyState message="No warehouses yet." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--kb-border)" }}>
                  <Th>Name</Th>
                  <Th>Code</Th>
                  <Th>City</Th>
                  <Th>SKUs</Th>
                  <Th>Default</Th>
                  <Th>Active</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((w) => (
                  <tr key={w.id} style={{ borderBottom: "1px solid var(--kb-border)" }}>
                    <Td>
                      <Link href={`/app/inventory/warehouses/${w.id}`} style={{ color: "var(--kb-primary)" }}>
                        {w.name}
                      </Link>
                    </Td>
                    <Td>
                      <code className="text-xs">{w.code}</code>
                    </Td>
                    <Td>{w.city ?? "-"}</Td>
                    <Td>{w.skuCount}</Td>
                    <Td>{w.isDefault ? "Yes" : "-"}</Td>
                    <Td>{w.active ? "Yes" : "No"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
