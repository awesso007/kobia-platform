/*
 * /app/mail/[accountId]/[folder] (Sprint 23) - a single folder listing.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { notFound } from "next/navigation";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../../CrmError";
import { loadMailView, FOLDERS } from "../../queries";
import { MailShell, type MailMessage } from "../../MailUI";
import type { EmailFolder } from "@/lib/db/generated/tenant";

export const dynamic = "force-dynamic";

const TITLES: Record<string, string> = {
  INBOX: "Inbox",
  SENT: "Sent",
  DRAFTS: "Drafts",
  ARCHIVE: "Archive",
  SPAM: "Spam",
  TRASH: "Trash",
};

export default async function FolderPage({
  params,
  searchParams,
}: {
  params: { accountId: string; folder: string };
  searchParams: { cursor?: string };
}) {
  const folder = params.folder.toUpperCase() as EmailFolder;
  if (!FOLDERS.includes(folder)) notFound();
  try {
    const data = await loadMailView({ accountId: params.accountId, folder, cursor: searchParams.cursor });
    if (!data) notFound();
    return (
      <MailShell
        accounts={data.accounts}
        account={data.account}
        labels={data.labels}
        counts={data.counts}
        messages={data.messages as unknown as MailMessage[]}
        nextCursor={data.nextCursor}
        activeFolder={folder}
        activeLabelId={null}
        activeThreadId={null}
        listTitle={TITLES[folder] ?? folder}
      />
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
