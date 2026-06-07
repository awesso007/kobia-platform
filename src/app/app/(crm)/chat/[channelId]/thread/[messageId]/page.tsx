/*
 * Chat thread view (Sprint 16). Server component: loads the parent message's
 * replies and renders a focused thread pane with its own composer.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../../../CrmError";
import { listMessages } from "@/lib/chat/queries";
import { ChatSidebar, ThreadView } from "../../../ChatUI";
import { channelsForCurrentUser, currentUserId, listMembers } from "../../../queries";

export const dynamic = "force-dynamic";

export default async function ThreadPage({ params }: { params: { channelId: string; messageId: string } }) {
  try {
    const { db } = getTenantDb();
    const [channels, userId, members, parent, page] = await Promise.all([
      channelsForCurrentUser(),
      currentUserId(),
      listMembers(),
      db.chatMessage.findUnique({ where: { id: params.messageId } }),
      listMessages(db, params.channelId, { parentId: params.messageId }),
    ]);

    const parentMessage = parent
      ? [
          {
            id: parent.id,
            channelId: parent.channelId,
            parentId: parent.parentId,
            authorId: parent.authorId,
            authorName: parent.authorName,
            bodyText: parent.bodyText,
            editedAt: parent.editedAt,
            createdAt: parent.createdAt,
            reactions: [],
            replyCount: 0,
          },
        ]
      : [];

    return (
      <div className="flex h-[calc(100vh-3.5rem)]">
        <ChatSidebar channels={channels as never} activeId={params.channelId} />
        <ThreadView
          channelId={params.channelId}
          parentId={params.messageId}
          currentUserId={userId}
          members={members}
          initialReplies={[...parentMessage, ...page.messages] as never}
        />
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
