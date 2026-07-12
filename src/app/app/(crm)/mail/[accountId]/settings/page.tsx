/*
 * /app/mail/[accountId]/settings (Sprint 23) - manage labels, filters, and
 * signatures for the account.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { notFound } from "next/navigation";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../../CrmError";
import { loadSettingsView } from "../../queries";
import { SettingsPanel, type MailFilter, type MailSignature } from "../../MailUI";

export const dynamic = "force-dynamic";

export default async function MailSettingsPage({ params }: { params: { accountId: string } }) {
  try {
    const data = await loadSettingsView(params.accountId);
    if (!data) notFound();
    return (
      <SettingsPanel
        account={data.account}
        labels={data.labels}
        filters={data.filters as unknown as MailFilter[]}
        signatures={data.signatures as unknown as MailSignature[]}
      />
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
