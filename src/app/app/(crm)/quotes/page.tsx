import Link from "next/link";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../CrmError";
import { getQuotes } from "./queries";
import { QuotesList } from "./QuotesList";
import { NewQuoteButton } from "./NewQuoteButton";

export const dynamic = "force-dynamic";

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const status = Array.isArray(searchParams.status) ? searchParams.status[0] : searchParams.status;
  const q = Array.isArray(searchParams.q) ? searchParams.q[0] : searchParams.q;
  const page = Number(Array.isArray(searchParams.page) ? searchParams.page[0] : searchParams.page) || 1;

  try {
    const result = await getQuotes({ status, q, page });
    return (
      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="mb-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>CRM</div>
            <h1 style={{ fontSize: "var(--kb-fs-h1)", fontWeight: 600, color: "var(--kb-text-primary)" }}>Quotes</h1>
          </div>
          <NewQuoteButton />
        </div>
        <QuotesList result={result} status={status ?? ""} q={q ?? ""} />
        <div className="mt-3 text-xs" style={{ color: "var(--kb-text-secondary)" }}>
          <Link href="/app/settings/products">Manage products</Link>
        </div>
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
