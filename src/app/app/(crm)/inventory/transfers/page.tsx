/*
 * Stock transfers list (Sprint 20). Server component; lists transfers with
 * status and warehouse endpoints.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../CrmError";
import { listTransfers } from "@/lib/inventory/queries";
import { fmtDate } from "@/lib/inventory/inventory-utils";
import { PageHeader, Subnav, Card, EmptyState, Th, Td, StatusBadge } from "../InventoryUI";

export const dynamic = "force-dynamic";

export default async function TransfersPage() {
  try {
    const { db } = getTenantDb();
    const rows = await listTransfers(db);
    return (
      <div className="p-6">
        <PageHeader
          title="Transfers"
          subtitle="Move stock between warehouses."
          action={
            <Link href="/app/inventory/transfers/new" className="inline-flex items-center rounded px-3 py-1.5 text-sm font-medium text-white" style={{ backgroundColor: "var(--kb-primary)", borderRadius: "var(--kb-radius-sm)" }}>
              New transfer
            </Link>
          }
        />
        <Subnav />
        <Card>
          {rows.length === 0 ? (
            <EmptyState message="No transfers yet." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--kb-border)" }}>
                  <Th>Number</Th>
                  <Th>From</Th>
                  <Th>To</Th>
                  <Th>Items</Th>
                  <Th>Status</Th>
                  <Th>Created</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id} style={{ borderBottom: "1px solid var(--kb-border)" }}>
                    <Td>
                      <Link href={`/app/inventory/transfers/${t.id}`} style={{ color: "var(--kb-primary)" }}>
                        {t.transferNumber}
                      </Link>
                    </Td>
                    <Td>{t.fromWarehouseName}</Td>
                    <Td>{t.toWarehouseName}</Td>
                    <Td>{t.itemCount}</Td>
                    <Td>
                      <StatusBadge status={t.status} />
                    </Td>
                    <Td>{fmtDate(t.createdAt)}</Td>
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
