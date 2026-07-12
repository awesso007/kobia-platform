/*
 * /app/mail/[accountId]/label/[labelId] (Sprint 23) - messages under a label.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { notFound } from "next/navigation";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../../../CrmError";
import { loadMailView } from "../../../queries";
import { MailShell, type MailMessage } from "../../../MailUI";

export const dynamic = "force-dynamic";

export default async function LabelPage({
  params,
  searchParams,
}: {
  params: { accountId: string; labelId: string };
  searchParams: { cursor?: string };
}) {
  try {
    const data = await loadMailView({
      accountId: params.accountId,
      labelId: params.labelId,
      cursor: searchParams.cursor,
    });
    if (!data) notFound();
    const label = data.labels.find((l) => l.id === params.labelId);
    return (
      <MailShell
        accounts={data.accounts}
        account={data.account}
        labels={data.labels}
        counts={data.counts}
        messages={data.messages as unknown as MailMessage[]}
        nextCursor={data.nextCursor}
        activeFolder={null}
        activeLabelId={params.labelId}
        activeThreadId={null}
        listTitle={label ? label.name : "Label"}
      />
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
