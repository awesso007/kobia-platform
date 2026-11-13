/**
 * Channel privacy admission for historical chat mutation and read endpoints.
 * A tenant membership is insufficient for PRIVATE, DM or GROUP_DM channels.
 * No handler should silently enroll a caller into a private conversation.
 */
import type { PrismaClient } from "@/lib/db/generated/tenant";
type Db = Pick<PrismaClient, "chatChannel" | "chatMember" | "chatMessage">;

export async function authorizedChatChannel(
  db: Pick<Db,"chatChannel"|"chatMember">,
  channelId: string,
  userId: string,
): Promise<"PUBLIC" | "MEMBER" | null> {
  if (!channelId || !userId) return null;
  const channel = await db.chatChannel.findFirst({
    where: { id: channelId, isArchived: false }, select: { kind: true },
  });
  if (!channel) return null;
  if (channel.kind === "PUBLIC") return "PUBLIC";
  const member = await db.chatMember.findUnique({
    where: { channelId_userId: { channelId, userId } }, select: { id: true },
  });
  return member ? "MEMBER" : null;
}
export async function messageBelongsToChannel(
  db: Pick<Db,"chatMessage">, channelId: string, messageId: string,
): Promise<boolean> {
  return !!channelId && !!messageId && !!(await db.chatMessage.findFirst({
    where: { id: messageId, channelId, deletedAt: null }, select: { id: true },
  }));
}
