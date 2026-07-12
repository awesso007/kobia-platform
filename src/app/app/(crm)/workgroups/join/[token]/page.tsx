/*
 * Invite landing page (Sprint 22). Server component: renders the accept-invite
 * action for a given token. The actual acceptance is a POST to
 * /api/workgroups/invites/[token]/accept from the client component.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { JoinInvite } from "../../JoinInviteUI";

export const dynamic = "force-dynamic";

export default function JoinInvitePage({ params }: { params: { token: string } }) {
  return (
    <div className="mx-auto max-w-lg p-6">
      <Link href="/app/workgroups" className="mb-2 inline-block text-sm underline" style={{ color: "var(--kb-text-secondary)" }}>
        All groups
      </Link>
      <h1 className="mb-4 text-lg font-semibold" style={{ color: "var(--kb-text-primary)" }}>Join workgroup</h1>
      <JoinInvite token={params.token} />
    </div>
  );
}
