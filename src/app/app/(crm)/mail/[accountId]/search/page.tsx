/*
 * /app/mail/[accountId]/search?q= (Sprint 23) - full-account search results in
 * the three-pane shell.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { notFound } from "next/navigation";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../../CrmError";
import { loadMailView } from "../../queries";
import { MailShell, type MailMessage } from "../../MailUI";

export const dynamic = "force-dynamic";

export default async function MailSearchPage({
  params,
  searchParams,
}: {
  params: { accountId: string };
  searchParams: { q?: string; cursor?: string };
}) {
  const q = (searchParams.q ?? "").trim();
  try {
    const data = await loadMailView({ accountId: params.accountId, q, cursor: searchParams.cursor });
    if (!data) notFound();
    return (
      <MailShell
        accounts={data.accounts}
        account={data.account}
        labels={data.labels}
        counts={data.counts}
        messages={data.messages as unknown as MailMessage[]}
        nextCursor={data.nextCursor}
        activeFolder={null}
        activeLabelId={null}
        activeThreadId={null}
        listTitle={q ? `Search: ${q}` : "Search"}
        searchInitial={q}
      />
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
