/*
 * Feed stream (Sprint 21). Server component: loads the tenant feed page and
 * renders the composer plus the paginated stream. The filter comes from the
 * ?filter= query (all | announcements | mentions | mine).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../CrmError";
import { loadFeedPage } from "./queries";
import { FeedStream } from "./FeedUI";
import { FeedComposer } from "./FeedComposerUI";
import type { FeedFilter } from "@/lib/feed/queries";

export const dynamic = "force-dynamic";

const FILTERS: FeedFilter[] = ["all", "announcements", "mentions", "mine"];

export default async function FeedPage({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  try {
    const raw = searchParams.filter ?? "all";
    const filter: FeedFilter = (FILTERS as string[]).includes(raw) ? (raw as FeedFilter) : "all";
    const { posts, nextCursor, currentUserId, members, canPin } = await loadFeedPage(filter);
    return (
      <div className="mx-auto max-w-2xl p-6">
        <h1 className="mb-4 text-lg font-semibold" style={{ color: "var(--kb-text-primary)" }}>Feed</h1>
        <FeedComposer members={members} />
        <FeedStream
          posts={posts}
          nextCursor={nextCursor}
          currentUserId={currentUserId}
          filter={filter}
          canPin={canPin}
        />
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
