/*
 * Chat settings (Sprint 16). Server component: lists the caller's channels with
 * their current per-channel notification level so they can adjust each one.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../CrmError";
import { channelsForCurrentUser, currentUserId } from "../queries";
import { ChatSidebar, ChatSettings } from "../ChatUI";

export const dynamic = "force-dynamic";

export default async function ChatSettingsPage() {
  try {
    const { db } = getTenantDb();
    const [channels, userId] = await Promise.all([channelsForCurrentUser(), currentUserId()]);
    const prefRows = userId
      ? await db.chatNotificationPref.findMany({ where: { userId } })
      : [];
    const initialPrefs: Record<string, "ALL" | "MENTIONS" | "NONE"> = {};
    for (const p of prefRows) initialPrefs[p.channelId] = p.level as "ALL" | "MENTIONS" | "NONE";

    return (
      <div className="flex h-[calc(100vh-3.5rem)]">
        <ChatSidebar channels={channels as never} />
        <main className="flex-1 overflow-y-auto">
          <ChatSettings
            channels={channels.map((c) => ({ id: c.id, name: c.name, kind: c.kind }))}
            initialPrefs={initialPrefs}
          />
        </main>
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
