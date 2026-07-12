/*
 * /app/mail (Sprint 23) - redirect to the first connected account's inbox, or
 * show a lightweight picker/empty state when there are no accounts.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../CrmError";
import { loadAccounts } from "./queries";

export const dynamic = "force-dynamic";

export default async function MailIndexPage() {
  try {
    const { accounts } = await loadAccounts();
    const first = accounts[0];
    if (first) redirect(`/app/mail/${first.id}/inbox`);
    return (
      <div className="mx-auto max-w-lg p-10 text-center">
        <h1 className="mb-2 text-lg font-semibold" style={{ color: "var(--kb-text-primary)" }}>
          No mailboxes connected
        </h1>
        <p className="mb-4 text-sm" style={{ color: "var(--kb-text-muted)" }}>
          Connect an email account to start using Webmail.
        </p>
        <Link
          href="/app/settings/email"
          className="inline-block rounded px-4 py-2 text-sm text-white"
          style={{ background: "var(--kb-primary)" }}
        >
          Email settings
        </Link>
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
