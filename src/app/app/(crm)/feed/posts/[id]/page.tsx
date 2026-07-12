/*
 * Feed post detail (Sprint 21). Server component: loads a single post with its
 * threaded comments and records a view for the current user. Renders the shared
 * PostDetail client component.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { notFound } from "next/navigation";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../../CrmError";
import { loadPostDetail } from "../../queries";
import { PostDetail } from "../../FeedUI";

export const dynamic = "force-dynamic";

export default async function FeedPostPage({ params }: { params: { id: string } }) {
  try {
    const { post, currentUserId, canPin } = await loadPostDetail(params.id);
    if (!post) notFound();
    const { comments, ...card } = post;
    return (
      <div className="mx-auto max-w-2xl p-6">
        <PostDetail post={card} comments={comments} currentUserId={currentUserId} canPin={canPin} />
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
