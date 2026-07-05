/*
 * New vendor page (Sprint 20). Renders the shared VendorForm.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { PageHeader, Subnav, Card, VendorForm } from "../../InventoryUI";

export const dynamic = "force-dynamic";

export default function NewVendorPage() {
  return (
    <div className="p-6">
      <PageHeader title="New vendor" />
      <Subnav />
      <Card>
        <VendorForm />
      </Card>
    </div>
  );
}
