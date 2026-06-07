/*
 * Knowledge base admin list (Sprint 15). Lists all KB articles (any status) with
 * their category, status, and visibility, linking to the editor.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { listKbArticles } from "../queries";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../CrmError";
import { fmtDateTime } from "../helpdesk-utils";
import { HelpdeskTabs, PageHeader } from "../HelpdeskUI";

export const dynamic = "force-dynamic";

export default async function KbListPage() {
  try {
    const articles = await listKbArticles();
    return (
      <div className="p-6">
        <PageHeader
          title="Knowledge base"
          subtitle="Self-serve help articles for the customer portal and public site."
          action={
            <div className="flex gap-2">
              <Link
                href="/app/helpdesk/kb/categories"
                className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Categories
              </Link>
              <Link
                href="/app/helpdesk/kb/new"
                className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
              >
                New article
              </Link>
            </div>
          }
        />
        <HelpdeskTabs active="/app/helpdesk/kb" />
        <div className="overflow-hidden rounded border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-2">Title</th>
                <th className="px-4 py-2">Category</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Visibility</th>
                <th className="px-4 py-2">Views</th>
                <th className="px-4 py-2">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {articles.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium text-slate-800">
                    <Link href={`/app/helpdesk/kb/${a.id}`} className="hover:underline">
                      {a.title}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-slate-600">{a.category?.name ?? "-"}</td>
                  <td className="px-4 py-2 text-slate-600">{a.status}</td>
                  <td className="px-4 py-2 text-slate-600">{a.visibility}</td>
                  <td className="px-4 py-2 text-slate-600">{a.viewCount}</td>
                  <td className="px-4 py-2 text-xs text-slate-400">{fmtDateTime(a.updatedAt)}</td>
                </tr>
              ))}
              {articles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">
                    No articles yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
