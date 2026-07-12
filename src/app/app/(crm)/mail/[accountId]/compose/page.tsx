/*
 * /app/mail/[accountId]/compose (Sprint 23) - full-screen composer inside the
 * three-pane shell.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { notFound } from "next/navigation";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../../CrmError";
import { loadComposeView } from "../../queries";
import { MailShell, Composer } from "../../MailUI";

export const dynamic = "force-dynamic";

export default async function ComposePage({ params }: { params: { accountId: string } }) {
  try {
    const data = await loadComposeView(params.accountId);
    if (!data) notFound();
    return (
      <MailShell
        accounts={data.accounts}
        account={data.account}
        labels={data.labels}
        counts={data.counts}
        messages={[]}
        nextCursor={null}
        activeFolder={null}
        activeLabelId={null}
        activeThreadId={null}
        listTitle="Inbox"
      >
        <div className="overflow-y-auto py-4">
          <Composer account={data.account} signatures={data.signatures} mode="full" />
        </div>
      </MailShell>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
