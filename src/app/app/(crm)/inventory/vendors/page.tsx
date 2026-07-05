/*
 * Vendors list (Sprint 20). Server component; lists vendors with PO counts.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../CrmError";
import { listVendors } from "@/lib/inventory/queries";
import { PageHeader, Subnav, Card, EmptyState, Th, Td } from "../InventoryUI";

export const dynamic = "force-dynamic";

export default async function VendorsPage() {
  try {
    const { db } = getTenantDb();
    const rows = await listVendors(db);
    return (
      <div className="p-6">
        <PageHeader
          title="Vendors"
          subtitle="Suppliers you buy stock from."
          action={
            <Link href="/app/inventory/vendors/new" className="inline-flex items-center rounded px-3 py-1.5 text-sm font-medium text-white" style={{ backgroundColor: "var(--kb-primary)", borderRadius: "var(--kb-radius-sm)" }}>
              New vendor
            </Link>
          }
        />
        <Subnav />
        <Card>
          {rows.length === 0 ? (
            <EmptyState message="No vendors yet." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--kb-border)" }}>
                  <Th>Name</Th>
                  <Th>Contact</Th>
                  <Th>Email</Th>
                  <Th>City</Th>
                  <Th>POs</Th>
                  <Th>Active</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => (
                  <tr key={v.id} style={{ borderBottom: "1px solid var(--kb-border)" }}>
                    <Td>
                      <Link href={`/app/inventory/vendors/${v.id}`} style={{ color: "var(--kb-primary)" }}>
                        {v.name}
                      </Link>
                    </Td>
                    <Td>{v.contactName ?? "-"}</Td>
                    <Td>{v.email ?? "-"}</Td>
                    <Td>{v.city ?? "-"}</Td>
                    <Td>{v.poCount}</Td>
                    <Td>{v.active ? "Yes" : "No"}</Td>
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
