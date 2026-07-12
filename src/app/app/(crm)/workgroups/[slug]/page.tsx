/*
 * Workgroup home = group feed (Sprint 22). Server component: loads the group
 * feed and reuses the shared FeedComposer + FeedStream scoped by workgroupId.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { notFound } from "next/navigation";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../CrmError";
import { loadGroupFeed } from "../queries";
import { FeedStream } from "../../feed/FeedUI";
import { FeedComposer } from "../../feed/FeedComposerUI";
import { canManage } from "@/lib/workgroups/workgroup-utils";

export const dynamic = "force-dynamic";

export default async function GroupFeedPage({ params }: { params: { slug: string } }) {
  try {
    const data = await loadGroupFeed(params.slug);
    if (!data) notFound();
    const { group, posts, nextCursor, currentUserId, members } = data;
    const canPin = canManage(group.myRole);
    return (
      <div>
        {group.myRole && <FeedComposer members={members} workgroupId={group.id} />}
        <FeedStream
          posts={posts}
          nextCursor={nextCursor}
          currentUserId={currentUserId}
          filter="all"
          canPin={canPin}
          workgroupId={group.id}
        />
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
