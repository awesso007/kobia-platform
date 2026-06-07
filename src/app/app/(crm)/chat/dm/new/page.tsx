/*
 * New direct message picker (Sprint 16). Server component: lists active members
 * so the caller can start (or reopen) a 1:1 DM.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../../CrmError";
import { channelsForCurrentUser, currentUserId, listMembers } from "../../queries";
import { ChatSidebar, NewDmPicker } from "../../ChatUI";

export const dynamic = "force-dynamic";

export default async function NewDmPage() {
  try {
    const [channels, userId, members] = await Promise.all([
      channelsForCurrentUser(),
      currentUserId(),
      listMembers(),
    ]);
    return (
      <div className="flex h-[calc(100vh-3.5rem)]">
        <ChatSidebar channels={channels as never} />
        <main className="flex-1">
          <NewDmPicker members={members} currentUserId={userId} />
        </main>
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
