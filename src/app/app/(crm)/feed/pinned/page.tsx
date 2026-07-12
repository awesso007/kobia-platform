/*
 * Pinned announcements board (Sprint 21). Server component: lists pinned posts
 * for the active tenant.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../CrmError";
import { loadPinnedPage } from "../queries";
import { PinnedList } from "../FeedUI";

export const dynamic = "force-dynamic";

export default async function FeedPinnedPage() {
  try {
    const { posts, currentUserId, canPin } = await loadPinnedPage();
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold" style={{ color: "var(--kb-text-primary)" }}>Pinned announcements</h1>
          <Link href="/app/feed" className="text-sm underline" style={{ color: "var(--kb-text-secondary)" }}>
            Back to feed
          </Link>
        </div>
        <PinnedList posts={posts} currentUserId={currentUserId} canPin={canPin} />
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
