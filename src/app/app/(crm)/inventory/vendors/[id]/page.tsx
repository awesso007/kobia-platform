/*
 * Vendor detail (Sprint 20). Editable vendor fields plus its purchase orders.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../../CrmError";
import { getVendor } from "@/lib/inventory/queries";
import { fmtCurrencyCents, fmtDate } from "@/lib/inventory/inventory-utils";
import { PageHeader, Subnav, Card, EmptyState, Th, Td, StatusBadge, VendorForm } from "../../InventoryUI";

export const dynamic = "force-dynamic";

export default async function VendorDetail({ params }: { params: { id: string } }) {
  try {
    const { db } = getTenantDb();
    const result = await getVendor(db, params.id);
    if (!result) notFound();
    const { vendor, purchaseOrders } = result;
    return (
      <div className="p-6">
        <PageHeader title={vendor.name} subtitle="Vendor details and purchase history." />
        <Subnav />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <h2 className="mb-2 text-sm font-medium" style={{ color: "var(--kb-text-primary)" }}>
              Details
            </h2>
            <Card>
              <VendorForm
                id={vendor.id}
                initial={{
                  name: vendor.name,
                  email: vendor.email ?? "",
                  phone: vendor.phone ?? "",
                  contactName: vendor.contactName ?? "",
                  city: vendor.city ?? "",
                  paymentTerms: vendor.paymentTerms ?? "",
                  notes: vendor.notes ?? "",
                  active: vendor.active,
                }}
              />
            </Card>
          </div>
          <div>
            <h2 className="mb-2 text-sm font-medium" style={{ color: "var(--kb-text-primary)" }}>
              Purchase orders
            </h2>
            <Card>
              {purchaseOrders.length === 0 ? (
                <EmptyState message="No purchase orders for this vendor." />
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--kb-border)" }}>
                      <Th>Number</Th>
                      <Th>Status</Th>
                      <Th>Total</Th>
                      <Th>Created</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchaseOrders.map((p) => (
                      <tr key={p.id} style={{ borderBottom: "1px solid var(--kb-border)" }}>
                        <Td>
                          <Link href={`/app/inventory/purchase-orders/${p.id}`} style={{ color: "var(--kb-primary)" }}>
                            {p.poNumber}
                          </Link>
                        </Td>
                        <Td>
                          <StatusBadge status={p.status} />
                        </Td>
                        <Td>{fmtCurrencyCents(p.totalCents, p.currency)}</Td>
                        <Td>{fmtDate(p.createdAt)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
        </div>
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
