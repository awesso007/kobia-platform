/*
 * Chat shell (Sprint 16). Server component: loads the caller's channels + DMs
 * and renders the sidebar. The main pane is empty until a channel is opened, or
 * shows the new-channel form when ?new=channel is present.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../CrmError";
import { channelsForCurrentUser } from "./queries";
import { ChatSidebar, NewChannelForm } from "./ChatUI";

export const dynamic = "force-dynamic";

export default async function ChatPage({ searchParams }: { searchParams: { new?: string } }) {
  try {
    const channels = await channelsForCurrentUser();
    const showNew = searchParams.new === "channel";
    return (
      <div className="flex h-[calc(100vh-3.5rem)]">
        <ChatSidebar channels={channels as never} />
        <main className="flex flex-1 flex-col">
          {showNew ? (
            <NewChannelForm />
          ) : (
            <div className="grid flex-1 place-items-center text-sm" style={{ color: "var(--kb-text-secondary)" }}>
              Select a channel to start chatting.
            </div>
          )}
        </main>
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
