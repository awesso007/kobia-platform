/*
 * New warehouse page (Sprint 20). Renders the shared WarehouseForm.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { PageHeader, Subnav, Card, WarehouseForm } from "../../InventoryUI";

export const dynamic = "force-dynamic";

export default function NewWarehousePage() {
  return (
    <div className="p-6">
      <PageHeader title="New warehouse" />
      <Subnav />
      <Card>
        <WarehouseForm />
      </Card>
    </div>
  );
}
