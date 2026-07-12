/*
 * Workgroup members (Sprint 22). Server component: loads members, invites, join
 * requests and the user directory, then renders the management panel.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { notFound } from "next/navigation";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../../CrmError";
import { loadGroupMembers } from "../../queries";
import { MembersPanel } from "../../MembersUI";

export const dynamic = "force-dynamic";

export default async function GroupMembersPage({ params }: { params: { slug: string } }) {
  try {
    const data = await loadGroupMembers(params.slug);
    if (!data) notFound();
    const { group, members, invites, joinRequests, directory } = data;
    return (
      <MembersPanel
        groupId={group.id}
        myRole={group.myRole}
        members={members}
        invites={invites}
        joinRequests={joinRequests}
        directory={directory}
      />
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
