/*
 * Transfer detail (Sprint 20). Shows header, line items, and Send/Receive
 * actions gated by status.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { notFound } from "next/navigation";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../../CrmError";
import { getTransfer } from "@/lib/inventory/queries";
import { fmtQuantity, fmtDate } from "@/lib/inventory/inventory-utils";
import { PageHeader, Subnav, Card, Th, Td, StatusBadge, TransferActions } from "../../InventoryUI";

export const dynamic = "force-dynamic";

export default async function TransferDetail({ params }: { params: { id: string } }) {
  try {
    const { db } = getTenantDb();
    const result = await getTransfer(db, params.id);
    if (!result) notFound();
    const { transfer, items } = result;
    return (
      <div className="p-6">
        <PageHeader
          title={transfer.transferNumber}
          subtitle={`${transfer.fromWarehouse.name} to ${transfer.toWarehouse.name}`}
          action={<TransferActions id={transfer.id} status={transfer.status} />}
        />
        <Subnav />
        <div className="mb-4 flex items-center gap-4 text-sm" style={{ color: "var(--kb-text-secondary)" }}>
          <span>
            Status <StatusBadge status={transfer.status} />
          </span>
          <span>Created {fmtDate(transfer.createdAt)}</span>
          {transfer.sentAt ? <span>Sent {fmtDate(transfer.sentAt)}</span> : null}
          {transfer.receivedAt ? <span>Received {fmtDate(transfer.receivedAt)}</span> : null}
        </div>
        {transfer.notes ? (
          <p className="mb-4 text-sm" style={{ color: "var(--kb-text-primary)" }}>
            {transfer.notes}
          </p>
        ) : null}
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--kb-border)" }}>
                <Th>Product</Th>
                <Th>Quantity</Th>
                <Th>Received</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} style={{ borderBottom: "1px solid var(--kb-border)" }}>
                  <Td>
                    {i.productName}
                    {i.sku ? <span className="ml-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>({i.sku})</span> : null}
                  </Td>
                  <Td>{fmtQuantity(i.quantity)}</Td>
                  <Td>{fmtQuantity(i.receivedQuantity)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
