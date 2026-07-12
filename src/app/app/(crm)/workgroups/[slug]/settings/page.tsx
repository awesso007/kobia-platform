/*
 * Workgroup settings (Sprint 22). Server component: loads the group shell and
 * renders the settings form. Only owners/moderators reach this tab (the header
 * hides it otherwise); a non-manager who navigates here still sees the form but
 * the API rejects writes.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { notFound } from "next/navigation";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../../CrmError";
import { loadGroupShell } from "../../queries";
import { SettingsForm } from "../../SettingsUI";

export const dynamic = "force-dynamic";

export default async function GroupSettingsPage({ params }: { params: { slug: string } }) {
  try {
    const { group } = await loadGroupShell(params.slug);
    if (!group) notFound();
    return (
      <SettingsForm
        group={{
          id: group.id,
          name: group.name,
          description: group.description,
          visibility: group.visibility,
          icon: group.icon,
          coverColor: group.coverColor,
          status: group.status,
        }}
      />
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
