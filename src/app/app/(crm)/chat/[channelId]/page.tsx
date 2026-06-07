/*
 * Chat channel view (Sprint 16). Server component: loads the channel, its
 * initial messages, pinned messages, and the member list for @mention
 * autocomplete, then renders the sidebar + polling channel view + info pane.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../CrmError";
import { channelsForCurrentUser, channelDetail, currentUserId, listMembers } from "../queries";
import { ChatSidebar, ChannelView, ChannelInfo } from "../ChatUI";

export const dynamic = "force-dynamic";

export default async function ChannelPage({ params }: { params: { channelId: string } }) {
  try {
    const [channels, detail, userId, members] = await Promise.all([
      channelsForCurrentUser(),
      channelDetail(params.channelId),
      currentUserId(),
      listMembers(),
    ]);

    if (!detail) {
      return (
        <div className="flex h-[calc(100vh-3.5rem)]">
          <ChatSidebar channels={channels as never} activeId={params.channelId} />
          <main className="grid flex-1 place-items-center text-sm" style={{ color: "var(--kb-text-secondary)" }}>
            Channel not found.
          </main>
        </div>
      );
    }

    return (
      <div className="flex h-[calc(100vh-3.5rem)]">
        <ChatSidebar channels={channels as never} activeId={params.channelId} />
        <ChannelView
          channelId={detail.channel.id}
          channelName={detail.channel.name}
          channelKind={detail.channel.kind as never}
          currentUserId={userId}
          members={members}
          initialMessages={detail.messages as never}
        />
        <ChannelInfo channel={detail.channel as never} pinned={detail.pinned as never} />
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
