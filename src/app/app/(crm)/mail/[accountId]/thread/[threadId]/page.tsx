/*
 * /app/mail/[accountId]/thread/[threadId] (Sprint 23) - three-pane view with
 * the thread expanded in the reader pane and an inline reply composer.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { notFound } from "next/navigation";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../../../CrmError";
import { loadThreadView } from "../../../queries";
import { MailShell, ThreadReader, type MailMessage, type ThreadMessage } from "../../../MailUI";

export const dynamic = "force-dynamic";

export default async function ThreadPage({ params }: { params: { accountId: string; threadId: string } }) {
  try {
    const data = await loadThreadView(params.accountId, params.threadId);
    if (!data) notFound();
    return (
      <MailShell
        accounts={data.accounts}
        account={data.account}
        labels={data.labels}
        counts={data.counts}
        messages={data.messages as unknown as MailMessage[]}
        nextCursor={data.nextCursor}
        activeFolder="INBOX"
        activeLabelId={null}
        activeThreadId={params.threadId}
        listTitle="Inbox"
      >
        <ThreadReader
          account={data.account}
          subject={data.thread.thread.subject ?? ""}
          messages={data.thread.messages as unknown as ThreadMessage[]}
          signatures={data.signatures}
        />
      </MailShell>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
